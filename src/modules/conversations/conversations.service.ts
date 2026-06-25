import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Message, MessageDirection } from '../message/entities/message.entity';
import {
  AnalyzeConversationDto,
  ConversationAnalysisResult,
  RecommendedAction,
  AnalysisPeriod,
} from './dto/analyze-conversation.dto';

const PERIOD_DAYS: Record<AnalysisPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };
const PERIOD_LABEL: Record<AnalysisPeriod, string> = {
  '7d': 'últimos 7 días',
  '30d': 'último mes',
  '90d': 'últimos 3 meses',
};

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Message, 'data')
    private readonly messageRepo: Repository<Message>,
    private readonly configService: ConfigService,
  ) {}

  async analyzeConversation(sessionId: string, dto: AnalyzeConversationDto): Promise<ConversationAnalysisResult> {
    const geminiApiKey = this.configService.get<string>('geminiApiKey', '');
    if (!geminiApiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is not configured on the server');
    }

    const days = PERIOD_DAYS[dto.period];
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.sessionId = :sessionId', { sessionId })
      .andWhere('m.chatId = :chatId', { chatId: dto.chatId })
      .andWhere('m.timestamp >= :cutoff', { cutoff })
      .andWhere('m.body IS NOT NULL')
      .andWhere("m.body != ''")
      .orderBy('m.timestamp', 'ASC')
      .limit(500)
      .getMany();

    const meta = {
      messageCount: messages.length,
      period: dto.period,
      from: new Date(cutoff * 1000).toISOString(),
      to: new Date().toISOString(),
    };

    if (messages.length === 0) {
      return { summary: '', highlights: [], actions: [], meta };
    }

    const conversationText = messages
      .map(m => {
        const ts = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
        const label = ts.toLocaleString('es', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const speaker = m.direction === MessageDirection.OUTGOING ? 'Yo' : 'Contacto';
        return `[${label}] ${speaker}: ${m.body}`;
      })
      .join('\n');

    const systemPrompt =
      `Eres un asistente experto en análisis de conversaciones de WhatsApp de uso profesional.\n` +
      `Responde ÚNICAMENTE con JSON válido y completo, sin explicaciones ni markdown.`;

    const userPrompt =
      `Analiza esta conversación de WhatsApp (${messages.length} mensajes, ${PERIOD_LABEL[dto.period]}):\n\n` +
      `${conversationText}\n\n` +
      `Responde con este JSON exacto (sin bloques de código):\n` +
      `{\n` +
      `  "summary": "Resumen ejecutivo de 2-3 párrafos: temas principales, estado de la relación y tono general",\n` +
      `  "highlights": ["punto clave 1", "punto clave 2", "punto clave 3"],\n` +
      `  "actions": [\n` +
      `    {\n` +
      `      "type": "follow_up|schedule_call|respond_pending|send_info|other",\n` +
      `      "priority": "high|medium|low",\n` +
      `      "description": "Acción concreta y específica a tomar",\n` +
      `      "suggestedMessage": "Texto sugerido para enviar (omitir si no aplica)"\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Gemini error ${res.status}: ${err.error?.message ?? 'unknown'}`);
    }

    const geminiData = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip optional markdown fence if Gemini wraps the JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini returned no JSON');

    const analysis = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      highlights?: string[];
      actions?: RecommendedAction[];
    };

    return {
      summary: analysis.summary ?? '',
      highlights: Array.isArray(analysis.highlights) ? analysis.highlights : [],
      actions: Array.isArray(analysis.actions) ? analysis.actions : [],
      meta,
    };
  }
}
