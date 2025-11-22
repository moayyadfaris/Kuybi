import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'

import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'

import {
  CreateFieldDefinitionDto,
  ReorderFieldsDto,
  ResponseFieldDefinitionDto,
  UpdateFieldDefinitionDto
} from '../dto'
import { FieldDefinitionsService } from '../services/field-definitions.service'

@ApiTags('Field Definitions')
@Controller('v1/post-types/:postTypeId/fields')
export class FieldDefinitionsController {
  constructor(private readonly fieldDefinitionsService: FieldDefinitionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all fields for a post type' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiResponse({
    status: 200,
    description: 'List of field definitions',
    type: [ResponseFieldDefinitionDto]
  })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async findAll(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string
  ): Promise<ResponseFieldDefinitionDto[]> {
    const fields = await this.fieldDefinitionsService.findByPostType(postTypeId)
    return plainToInstance(ResponseFieldDefinitionDto, fields, {
      excludeExtraneousValues: true
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get field definition by ID' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiParam({ name: 'id', description: 'Field definition ID' })
  @ApiResponse({
    status: 200,
    description: 'Field definition found',
    type: ResponseFieldDefinitionDto
  })
  @ApiResponse({ status: 404, description: 'Field definition not found' })
  async findOne(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ResponseFieldDefinitionDto> {
    const field = await this.fieldDefinitionsService.findOne(id)
    // Verify field belongs to the specified post type
    if (field.postTypeId !== postTypeId) {
      throw new NotFoundException('Field definition not found for this post type')
    }
    return plainToInstance(ResponseFieldDefinitionDto, field, {
      excludeExtraneousValues: true
    })
  }

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.FieldDefinition })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new field definition' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiResponse({
    status: 201,
    description: 'Field definition created',
    type: ResponseFieldDefinitionDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  @ApiResponse({ status: 409, description: 'Field name already exists' })
  async create(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string,
    @Body() createFieldDefinitionDto: CreateFieldDefinitionDto
  ): Promise<ResponseFieldDefinitionDto> {
    const field = await this.fieldDefinitionsService.create(postTypeId, createFieldDefinitionDto)
    return plainToInstance(ResponseFieldDefinitionDto, field, {
      excludeExtraneousValues: true
    })
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.FieldDefinition })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a field definition' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiParam({ name: 'id', description: 'Field definition ID' })
  @ApiResponse({
    status: 200,
    description: 'Field definition updated',
    type: ResponseFieldDefinitionDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Field definition not found' })
  @ApiResponse({ status: 409, description: 'Field name already exists' })
  async update(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFieldDefinitionDto: UpdateFieldDefinitionDto
  ): Promise<ResponseFieldDefinitionDto> {
    // Verify field belongs to post type first
    const existingField = await this.fieldDefinitionsService.findOne(id)
    if (existingField.postTypeId !== postTypeId) {
      throw new NotFoundException('Field definition not found for this post type')
    }
    const field = await this.fieldDefinitionsService.update(id, updateFieldDefinitionDto)
    return plainToInstance(ResponseFieldDefinitionDto, field, {
      excludeExtraneousValues: true
    })
  }

  @Post('reorder')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.FieldDefinition })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder field definitions' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiResponse({
    status: 200,
    description: 'Fields reordered',
    type: [ResponseFieldDefinitionDto]
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type or field not found' })
  async reorder(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string,
    @Body() reorderFieldsDto: ReorderFieldsDto
  ): Promise<ResponseFieldDefinitionDto[]> {
    await this.fieldDefinitionsService.reorderFields(postTypeId, reorderFieldsDto.fieldOrders)
    // Return updated fields
    const fields = await this.fieldDefinitionsService.findByPostType(postTypeId)
    return fields.map(field =>
      plainToInstance(ResponseFieldDefinitionDto, field, {
        excludeExtraneousValues: true
      })
    )
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.FieldDefinition })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a field definition' })
  @ApiParam({ name: 'postTypeId', description: 'Post type ID' })
  @ApiParam({ name: 'id', description: 'Field definition ID' })
  @ApiResponse({ status: 204, description: 'Field definition deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Field definition not found' })
  async remove(
    @Param('postTypeId', ParseUUIDPipe) postTypeId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    // Verify field belongs to post type first
    const field = await this.fieldDefinitionsService.findOne(id)
    if (field.postTypeId !== postTypeId) {
      throw new NotFoundException('Field definition not found for this post type')
    }
    await this.fieldDefinitionsService.remove(id)
  }
}
