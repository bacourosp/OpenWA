import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type AnalysisPeriod = '7d' | '30d' | '90d';

export class AnalyzeConversationDto {
  @ApiProperty({ description: 'Chat ID to analyze (e.g. 5491234567890@c.us or group@g.us)' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({ enum: ['7d', '30d', '90d'], description: 'Time period to analyze' })
  @IsEnum(['7d', '30d', '90d'])
  period: AnalysisPeriod;
}

export interface RecommendedAction {
  type: 'follow_up' | 'schedule_call' | 'respond_pending' | 'send_info' | 'other';
  priority: 'high' | 'medium' | 'low';
  description: string;
  suggestedMessage?: string;
}

export interface ConversationAnalysisResult {
  summary: string;
  highlights: string[];
  actions: RecommendedAction[];
  meta: {
    messageCount: number;
    period: AnalysisPeriod;
    from: string;
    to: string;
  };
}
