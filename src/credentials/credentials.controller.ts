import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

@Controller('api/credentials')
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post()
  create(@Body() createCredentialDto: CreateCredentialDto) {
    return this.credentialsService.create(createCredentialDto);
  }

  @Get()
  findAll(
    @Query('service') service?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.credentialsService.findAll(service, projectId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('includeSecret') includeSecret?: boolean,
  ) {
    return this.credentialsService.findOne(id, includeSecret);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCredentialDto: UpdateCredentialDto,
  ) {
    return this.credentialsService.update(id, updateCredentialDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.credentialsService.remove(id);
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string) {
    return this.credentialsService.validateCredential(id);
  }

  @Post(':id/rotate')
  async rotateSecret(
    @Param('id') id: string,
    @Body('secret') newSecret: string,
  ) {
    return this.credentialsService.rotateSecret(id, newSecret);
  }

  @Post('test')
  async testCredential(@Body() createCredentialDto: CreateCredentialDto) {
    return this.credentialsService.testCredential(createCredentialDto);
  }

  @Post('bulk-validate')
  async bulkValidate(@Body('ids') ids: string[]) {
    return this.credentialsService.bulkValidate(ids);
  }

  @Get(':id/usage')
  async getUsage(@Param('id') id: string) {
    return this.credentialsService.getUsageStats(id);
  }
}