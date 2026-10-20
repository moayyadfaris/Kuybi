import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'

import { AbilityFactory, AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { GetUser, JwtAuthGuard } from '@core/auth'

import { CreateCategoryDto } from '../dto/create-category.dto'
import { SearchCategoriesDto } from '../dto/search-categories.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'
import { CategoriesService } from '../services/categories.service'

/**
 * Category administration and reads for signed-in users (the public site reads them
 * through /web/v1/categories). Deleted categories are listed only to those who may
 * restore them.
 */
@ApiTags('categories')
@Controller('v1/categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly abilityFactory: AbilityFactory
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new category (admin only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category with this slug already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  create(@Body() createCategoryDto: CreateCategoryDto, @GetUser() user: User) {
    return this.categoriesService.create(createCategoryDto, user.id)
  }

  @Get()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all categories with optional filters' })
  @ApiResponse({ status: 200, description: 'List of categories with pagination' })
  findAll(@Query() searchDto: SearchCategoriesDto, @GetUser() user: User) {
    const mayRestore = this.abilityFactory.createForUser(user).can(Action.Restore, Subject.Category)
    return this.categoriesService.findAll(searchDto, {
      includeDeleted: !!searchDto.includeDeleted && mayRestore
    })
  }

  @Get('active')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active categories (cached)' })
  @ApiResponse({ status: 200, description: 'List of active categories' })
  findAllActive() {
    return this.categoriesService.findAllActive()
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get category statistics' })
  @ApiResponse({ status: 200, description: 'Category statistics' })
  getStats() {
    return this.categoriesService.getStats()
  }

  @Get('slug/:slug')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category slug', example: 'technology' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug)
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findOne(id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category; the slug changes only when one is sent' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @GetUser() user: User
  ) {
    return this.categoriesService.update(id, updateCategoryDto, user.id)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Category })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a category (admin only)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 204, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.categoriesService.remove(id, user.id)
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Restore, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a soft-deleted category (admin only)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 201, description: 'Category restored, active flag as before' })
  @ApiResponse({ status: 404, description: 'No deleted category with this ID' })
  @ApiResponse({ status: 409, description: 'A live category now uses its slug' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.restore(id)
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a category (super admin only)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 204, description: 'Category permanently deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - super admin only' })
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.hardDelete(id)
  }
}
