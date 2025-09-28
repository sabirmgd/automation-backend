import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JiraTicket, JiraAccount } from '../entities';
import { CreateJiraTicketDto, UpdateJiraTicketDto, TicketFilterDto } from '../dto/jira-ticket.dto';
import { JiraCommentDto, JiraAttachmentDto, TicketDetailsDto } from '../dto/jira-comment.dto';
import { JiraAccountService } from './jira-account.service';
import JiraClient from 'jira-client';

@Injectable()
export class JiraTicketService {
  constructor(
    @InjectRepository(JiraTicket)
    private readonly jiraTicketRepository: Repository<JiraTicket>,
    @InjectRepository(JiraAccount)
    private readonly jiraAccountRepository: Repository<JiraAccount>,
    private readonly accountService: JiraAccountService,
  ) {}

  async create(createDto: CreateJiraTicketDto): Promise<JiraTicket> {
    const ticket = this.jiraTicketRepository.create(createDto);
    return await this.jiraTicketRepository.save(ticket);
  }

  async bulkCreate(tickets: CreateJiraTicketDto[]): Promise<JiraTicket[]> {
    const entities = tickets.map((ticket) =>
      this.jiraTicketRepository.create(ticket)
    );
    return await this.jiraTicketRepository.save(entities);
  }

  async findAll(filter?: TicketFilterDto, mainProjectId?: string): Promise<JiraTicket[]> {
    console.log('=== TICKET SERVICE: findAll called ===');
    console.log('Filter parameter:', filter);
    console.log('MainProjectId parameter:', mainProjectId);

    const queryBuilder = this.jiraTicketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.board', 'board')
      .leftJoinAndSelect('ticket.project', 'project')
      .leftJoinAndSelect('ticket.assignee', 'assignee')
      .leftJoinAndSelect('ticket.reporter', 'reporter')
      .leftJoinAndSelect('ticket.analyses', 'analyses');

    console.log('Initial query builder created');

    if (mainProjectId) {
      console.log('Adding mainProjectId filter:', mainProjectId);
      queryBuilder.where('ticket.mainProjectId = :mainProjectId', { mainProjectId });
    }

    if (filter?.boardId) {
      console.log('Adding boardId filter:', filter.boardId);
      queryBuilder.andWhere('ticket.boardId = :boardId', { boardId: filter.boardId });
    }

    if (filter?.projectId) {
      console.log('Adding projectId filter:', filter.projectId);
      queryBuilder.andWhere('ticket.projectId = :projectId', { projectId: filter.projectId });
    }

    if (filter?.status) {
      console.log('Adding status filter:', filter.status);
      queryBuilder.andWhere('ticket.status = :status', { status: filter.status });
    }

    if (filter?.assigneeId) {
      console.log('Adding assigneeId filter:', filter.assigneeId);
      queryBuilder.andWhere('ticket.assigneeId = :assigneeId', { assigneeId: filter.assigneeId });
    }

    if (filter?.reporterId) {
      console.log('Adding reporterId filter:', filter.reporterId);
      queryBuilder.andWhere('ticket.reporterId = :reporterId', { reporterId: filter.reporterId });
    }

    if (filter?.issueType) {
      console.log('Adding issueType filter:', filter.issueType);
      queryBuilder.andWhere('ticket.issueType = :issueType', { issueType: filter.issueType });
    }

    if (filter?.priority) {
      console.log('Adding priority filter:', filter.priority);
      queryBuilder.andWhere('ticket.priority = :priority', { priority: filter.priority });
    }

    const sql = queryBuilder.getSql();
    console.log('Generated SQL query:', sql);

    const results = await queryBuilder.orderBy('ticket.jiraUpdatedAt', 'DESC').getMany();

    console.log(`Query returned ${results.length} tickets`);

    if (results.length === 0) {
      console.log('No tickets found. Possible reasons:');
      console.log('1. No tickets synced from Jira yet');
      console.log('2. Board has no tickets');
      console.log('3. Filters are too restrictive');

      const totalTickets = await this.jiraTicketRepository.count();
      console.log(`Total tickets in database: ${totalTickets}`);

      if (filter?.boardId) {
        const boardTickets = await this.jiraTicketRepository.count({
          where: { boardId: filter.boardId }
        });
        console.log(`Tickets for board ${filter.boardId}: ${boardTickets}`);
      }
    } else {
      console.log('Sample of returned tickets (first 3):');
      results.slice(0, 3).forEach((ticket, index) => {
        console.log(`  ${index + 1}. ${ticket.key}: ${ticket.summary} (Status: ${ticket.status})`);
      });
    }

    return results;
  }

  async findOne(id: string): Promise<JiraTicket> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id },
      relations: ['board', 'project', 'assignee', 'reporter', 'analyses'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    return ticket;
  }

  async findByKey(key: string): Promise<JiraTicket> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { key },
      relations: ['board', 'project', 'assignee', 'reporter', 'analyses'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with key ${key} not found`);
    }

    return ticket;
  }

  async update(id: string, updateDto: UpdateJiraTicketDto): Promise<JiraTicket> {
    const ticket = await this.findOne(id);
    Object.assign(ticket, updateDto);
    return await this.jiraTicketRepository.save(ticket);
  }

  async upsertByKey(key: string, data: CreateJiraTicketDto): Promise<JiraTicket> {
    let ticket = await this.jiraTicketRepository.findOne({ where: { key } });

    if (ticket) {
      Object.assign(ticket, data);
    } else {
      ticket = this.jiraTicketRepository.create({ ...data, key });
    }

    return await this.jiraTicketRepository.save(ticket);
  }

  async remove(id: string): Promise<void> {
    const result = await this.jiraTicketRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
  }

  async deleteByBoard(boardId: string): Promise<void> {
    await this.jiraTicketRepository.delete({ boardId });
  }

  async getTicketsByBoard(boardId: string): Promise<JiraTicket[]> {
    return await this.jiraTicketRepository.find({
      where: { boardId },
      relations: ['assignee', 'reporter', 'analyses'],
      order: { jiraUpdatedAt: 'DESC' },
    });
  }

  async getTicketsByProject(projectId: string): Promise<JiraTicket[]> {
    return await this.jiraTicketRepository.find({
      where: { projectId },
      relations: ['board', 'assignee', 'reporter', 'analyses'],
      order: { jiraUpdatedAt: 'DESC' },
    });
  }

  async getUnanalyzedTickets(boardId?: string): Promise<JiraTicket[]> {
    const queryBuilder = this.jiraTicketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.analyses', 'analysis')
      .where('analysis.id IS NULL OR analysis.status != :status', {
        status: 'completed',
      });

    if (boardId) {
      queryBuilder.andWhere('ticket.boardId = :boardId', { boardId });
    }

    return await queryBuilder.getMany();
  }

  async updateLastSyncedAt(ticketIds: string[]): Promise<void> {
    if (ticketIds.length === 0) return;

    await this.jiraTicketRepository.update(
      { id: In(ticketIds) },
      { lastSyncedAt: new Date() }
    );
  }

  private getJiraClient(account: any): JiraClient {
    return new JiraClient({
      protocol: 'https',
      host: account.jiraUrl.replace(/^https?:\/\//, ''),
      username: account.email,
      password: account.apiToken || account.encryptedApiToken,
      apiVersion: '2',
      strictSSL: true,
    });
  }

  async getTicketComments(ticketId: string): Promise<JiraCommentDto[]> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['board'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (!ticket.board) {
      throw new NotFoundException('Board not found for ticket');
    }

    const account = await this.accountService.getDecryptedAccount(ticket.board.accountId);
    const client = this.getJiraClient(account);

    try {
      const issue = await client.getIssue(ticket.key, null, 'comments');
      const comments = issue.fields?.comment?.comments || [];

      return comments.map((comment: any) => ({
        id: comment.id,
        author: {
          accountId: comment.author.accountId,
          displayName: comment.author.displayName,
          avatarUrl: comment.author.avatarUrls?.['48x48'],
        },
        body: comment.body,
        renderedBody: comment.renderedBody,
        created: new Date(comment.created),
        updated: new Date(comment.updated),
      }));
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      throw error;
    }
  }

  async getTicketAttachments(ticketId: string): Promise<JiraAttachmentDto[]> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['board'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (!ticket.board) {
      throw new NotFoundException('Board not found for ticket');
    }

    const account = await this.accountService.getDecryptedAccount(ticket.board.accountId);
    const client = this.getJiraClient(account);

    try {
      const issue = await client.getIssue(ticket.key, null, 'attachment');
      const attachments = issue.fields?.attachment || [];

      return attachments.map((attachment: any) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        content: attachment.content,
        thumbnail: attachment.thumbnail,
        author: {
          accountId: attachment.author?.accountId,
          displayName: attachment.author?.displayName,
        },
        created: new Date(attachment.created),
      }));
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
      throw error;
    }
  }

  async updateTicketDescription(ticketId: string, description: string): Promise<void> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['board'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (!ticket.board) {
      throw new NotFoundException('Board not found for ticket');
    }

    const account = await this.accountService.getDecryptedAccount(ticket.board.accountId);
    const client = this.getJiraClient(account);

    try {
      await client.updateIssue(ticket.key, {
        fields: {
          description: description
        }
      });

      // Update local database as well
      await this.jiraTicketRepository.update(ticketId, { description });
    } catch (error) {
      console.error('Failed to update ticket description:', error);
      throw error;
    }
  }

  async getAttachmentContent(ticketId: string, attachmentId: string): Promise<{ content: Buffer; mimeType: string; filename: string }> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['board'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (!ticket.board) {
      throw new NotFoundException('Board not found for ticket');
    }

    const account = await this.accountService.getDecryptedAccount(ticket.board.accountId);
    const client = this.getJiraClient(account);

    try {
      // First get the attachment metadata to get the content URL
      const issue = await client.getIssue(ticket.key, null, 'attachment');
      const attachments = issue.fields?.attachment || [];

      const attachment = attachments.find((att: any) => att.id === attachmentId);
      if (!attachment) {
        throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
      }

      // Fetch the attachment content using authenticated request
      const axios = require('axios');
      const response = await axios.get(attachment.content, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${account.email}:${account.apiToken || account.encryptedApiToken}`).toString('base64')}`,
          'Accept': '*/*',
        },
        responseType: 'arraybuffer',
      });

      return {
        content: response.data,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
      };
    } catch (error) {
      console.error('Failed to fetch attachment content:', error);
      throw error;
    }
  }

  async getTicketDetails(ticketId: string): Promise<TicketDetailsDto> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
      relations: ['board', 'assignee', 'reporter'],
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (!ticket.board) {
      throw new NotFoundException('Board not found for ticket');
    }

    const account = await this.accountService.getDecryptedAccount(ticket.board.accountId);
    const client = this.getJiraClient(account);

    try {
      const issue = await client.getIssue(ticket.key, null, '*all');

      const comments = issue.fields?.comment?.comments || [];
      const attachments = issue.fields?.attachment || [];

      return {
        id: ticket.id,
        key: ticket.key,
        summary: ticket.summary,
        description: issue.fields?.description,
        renderedDescription: issue.renderedFields?.description,
        issueType: ticket.issueType,
        status: ticket.status,
        priority: ticket.priority,
        assignee: ticket.assignee ? {
          accountId: ticket.assignee.accountId,
          displayName: ticket.assignee.displayName,
          avatarUrl: ticket.assignee.avatarUrl,
        } : undefined,
        reporter: ticket.reporter ? {
          accountId: ticket.reporter.accountId,
          displayName: ticket.reporter.displayName,
          avatarUrl: ticket.reporter.avatarUrl,
        } : undefined,
        labels: ticket.labels,
        components: ticket.components,
        comments: comments.map((comment: any) => ({
          id: comment.id,
          author: {
            accountId: comment.author.accountId,
            displayName: comment.author.displayName,
            avatarUrl: comment.author.avatarUrls?.['48x48'],
          },
          body: comment.body,
          renderedBody: comment.renderedBody,
          created: new Date(comment.created),
          updated: new Date(comment.updated),
        })),
        attachments: attachments.map((attachment: any) => ({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          // Don't send the actual content URLs, we'll proxy them through our backend
          content: null,
          thumbnail: null,
          author: {
            accountId: attachment.author?.accountId,
            displayName: attachment.author?.displayName,
          },
          created: new Date(attachment.created),
        })),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      };
    } catch (error) {
      console.error('Failed to fetch ticket details:', error);
      throw error;
    }
  }
}