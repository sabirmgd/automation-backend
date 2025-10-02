import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DatabaseCredentialService } from '../services/database-credential.service';
import { DatabaseConnectionService, ConnectionTestResult } from '../services/database-connection.service';
import {
  CreateDatabaseCredentialDto,
  UpdateDatabaseCredentialDto,
  TestConnectionDto,
} from '../dto';
import { DatabaseCredential, Environment } from '../entities/database-credential.entity';

@ApiTags('Database Credentials')
@Controller('database-credentials')
export class DatabaseCredentialController {
  constructor(
    private readonly credentialService: DatabaseCredentialService,
    private readonly connectionService: DatabaseConnectionService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new database credential' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The database credential has been successfully created.',
    type: DatabaseCredential,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Database credential with this name already exists.',
  })
  async create(
    @Body(ValidationPipe) dto: CreateDatabaseCredentialDto,
  ): Promise<DatabaseCredential> {
    return await this.credentialService.create(dto);
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a database connection without saving' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Connection test result',
  })
  async testConnection(
    @Body(ValidationPipe) dto: TestConnectionDto,
  ): Promise<ConnectionTestResult> {
    return await this.connectionService.testConnection(dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test an existing database credential connection' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Connection test result',
  })
  async testCredential(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConnectionTestResult> {
    return await this.connectionService.testCredentialConnection(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all database credentials' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: String,
    description: 'Filter by project ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of database credentials',
    type: [DatabaseCredential],
  })
  async findAll(
    @Query('projectId') projectId?: string,
  ): Promise<DatabaseCredential[]> {
    return await this.credentialService.findAll(projectId);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get database credentials by project' })
  @ApiParam({ name: 'projectId', type: String, description: 'Project UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of database credentials for the project',
    type: [DatabaseCredential],
  })
  async findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<DatabaseCredential[]> {
    return await this.credentialService.findByProject(projectId);
  }

  @Get('project/:projectId/environment/:environment')
  @ApiOperation({ summary: 'Get database credentials by project and environment' })
  @ApiParam({ name: 'projectId', type: String, description: 'Project UUID' })
  @ApiParam({
    name: 'environment',
    enum: Environment,
    description: 'Environment type',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of database credentials for the project and environment',
    type: [DatabaseCredential],
  })
  async findByEnvironment(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environment') environment: Environment,
  ): Promise<DatabaseCredential[]> {
    return await this.credentialService.findByEnvironment(projectId, environment);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get database credential statistics' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    type: String,
    description: 'Filter statistics by project ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Database credential statistics',
  })
  async getStatistics(
    @Query('projectId') projectId?: string,
  ): Promise<any> {
    return await this.credentialService.getStatistics(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a database credential by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The database credential',
    type: DatabaseCredential,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Database credential not found',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DatabaseCredential> {
    return await this.credentialService.findOne(id);
  }

  @Get(':id/connection-string')
  @ApiOperation({ summary: 'Get connection string for a database credential' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The connection string (password masked)',
    type: String,
  })
  async getConnectionString(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ connectionString: string }> {
    const connectionString = await this.connectionService.getConnectionString(id);
    return { connectionString };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a database credential' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The database credential has been successfully updated.',
    type: DatabaseCredential,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Database credential not found',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: UpdateDatabaseCredentialDto,
  ): Promise<DatabaseCredential> {
    return await this.credentialService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle active status of a database credential' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The database credential status has been toggled.',
    type: DatabaseCredential,
  })
  async toggleActive(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DatabaseCredential> {
    return await this.credentialService.toggleActive(id);
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone a database credential to another environment' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The database credential has been successfully cloned.',
    type: DatabaseCredential,
  })
  async cloneCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { environment: Environment; name?: string },
  ): Promise<DatabaseCredential> {
    return await this.credentialService.cloneCredential(
      id,
      body.environment,
      body.name,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a database credential' })
  @ApiParam({ name: 'id', type: String, description: 'Credential UUID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'The database credential has been successfully deleted.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Database credential not found',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.credentialService.remove(id);
  }
}