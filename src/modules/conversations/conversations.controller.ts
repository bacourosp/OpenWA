import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { AnalyzeConversationDto } from './dto/analyze-conversation.dto';
import { RequireRole, SessionScoped } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('conversations')
@SessionScoped()
@Controller('sessions/:sessionId/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('analyze')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze a chat conversation with AI and get a summary + recommended actions' })
  @ApiParam({ name: 'sessionId', description: 'WhatsApp session ID' })
  async analyze(@Param('sessionId') sessionId: string, @Body() dto: AnalyzeConversationDto) {
    return this.conversationsService.analyzeConversation(sessionId, dto);
  }
}
