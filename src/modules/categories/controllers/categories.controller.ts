import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'

import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { CreateCategoryDto } from '@modules/categories/dto/create-category.dto'
import { SearchCategoriesDto } from '@modules/categories/dto/search-categories.dto'
import { UpdateCategoryDto } from '@modules/categories/dto/update-category.dto'
import { CategoriesService } from '@modules/categories/services/categories.service'

@ApiTags('categories')
@Controller('v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new category (admin only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category with this slug already exists' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto)
  }

  @Get()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Read, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all categories with optional filters' })
  @ApiResponse({ status: 200, description: 'List of categories with pagination' })
  findAll(@Query() searchDto: SearchCategoriesDto) {
    return this.categoriesService.findAll(searchDto)
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
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category (admin only)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto)
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
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id)
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Restore, subject: Subject.Category })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a soft-deleted category (admin only)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category restored successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  restore(@Param('id') id: string) {
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
  hardDelete(@Param('id') id: string) {
    return this.categoriesService.hardDelete(id)
  }
}
