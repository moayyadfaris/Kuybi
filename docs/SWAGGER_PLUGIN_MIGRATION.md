# NestJS Swagger Plugin Migration Guide

## Overview

The NestJS Swagger Plugin has been enabled in `nest-cli.json` to automatically generate OpenAPI decorators, reducing boilerplate code and improving developer experience.

## Configuration

**File**: `nest-cli.json`

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": true,
          "introspectComments": true,
          "dtoFileNameSuffix": [".dto.ts", ".entity.ts"],
          "controllerFileNameSuffix": [".controller.ts"],
          "dtoKeyOfComment": "description",
          "controllerKeyOfComment": "summary"
        }
      }
    ]
  }
}
```

## What the Plugin Does Automatically

### 1. **Auto-annotate DTO Properties**
The plugin automatically adds `@ApiProperty()` to all DTO properties unless `@ApiHideProperty` is used.

### 2. **Infer `required` Property**
```typescript
// Before (manual)
@ApiProperty({ required: false })
name?: string

// After (automatic)
name?: string  // Plugin knows it's optional from the '?'
```

### 3. **Infer Type & Enum**
```typescript
// Before (manual)
@ApiProperty({ type: String })
title: string

@ApiProperty({ enum: UserRole })
role: UserRole

// After (automatic)
title: string       // Plugin infers type
role: UserRole      // Plugin infers enum
```

### 4. **Set Default Values**
```typescript
// Before (manual)
@ApiProperty({ default: true })
isActive: boolean = true

// After (automatic)
isActive: boolean = true  // Plugin reads the default value
```

### 5. **Apply Validation Rules**
With `classValidatorShim: true`, the plugin reads `class-validator` decorators:

```typescript
// Before (manual)
@IsEmail()
@ApiProperty({ format: 'email' })
email: string

@Min(18)
@Max(100)
@ApiProperty({ minimum: 18, maximum: 100 })
age: number

// After (automatic)
@IsEmail()
email: string  // Plugin infers format: 'email'

@Min(18)
@Max(100)
age: number   // Plugin infers minimum & maximum
```

### 6. **Generate Descriptions from Comments**
With `introspectComments: true`:

```typescript
/**
 * User's email address for authentication
 */
@IsEmail()
email: string

// Swagger will show: "User's email address for authentication"
```

### 7. **Auto-add Response Decorators**
The plugin automatically adds `@ApiResponse()` to controller endpoints.

## Migration Strategy

### Phase 1: Enable Plugin (✅ Done)
- Plugin configured in `nest-cli.json`
- No breaking changes - works alongside existing decorators

### Phase 2: Gradual Migration (Recommended)

#### Option A: Keep Current Code (No Action Needed)
The plugin works alongside existing `@ApiProperty()` decorators. No immediate changes required.

#### Option B: Simplify DTOs (Recommended for New Code)
For new DTOs or when refactoring, you can simplify:

**Before** (search-categories.dto.ts):
```typescript
export class SearchCategoriesDto {
  @ApiPropertyOptional({
    description: 'Search term to filter categories',
    example: 'technology'
  })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1
}
```

**After** (simplified):
```typescript
export class SearchCategoriesDto {
  /**
   * Search term to filter categories
   * @example technology
   */
  @IsOptional()
  @IsString()
  search?: string

  /**
   * Filter by active status
   * @example true
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean

  /**
   * Page number (1-based)
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1
}
```

### Phase 3: Remove Redundant Decorators (Optional)

You can gradually remove decorators that the plugin infers:

#### Can Be Removed:
- ✅ `@ApiProperty({ type: String })` - Plugin infers from TypeScript type
- ✅ `@ApiProperty({ required: false })` - Plugin infers from `?`
- ✅ `@ApiProperty({ default: value })` - Plugin reads from `= value`
- ✅ `@ApiProperty({ minimum: X, maximum: Y })` - Plugin reads from `@Min()`, `@Max()`
- ✅ `@ApiProperty({ enum: EnumType })` - Plugin infers from TypeScript enum

#### Should Keep:
- ❌ `@ApiPropertyOptional()` - Convenience decorator (though not required)
- ❌ Custom descriptions if not using JSDoc comments
- ❌ Complex examples that aren't simple `@example` tags
- ❌ Custom schema overrides

## Example Migration

### DTO Example

**Before**:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ 
    description: 'User email address',
    example: 'user@example.com',
    format: 'email'
  })
  @IsEmail()
  email: string

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    minLength: 2,
    maxLength: 100
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890'
  })
  @IsOptional()
  @IsString()
  phone?: string
}
```

**After** (with plugin):
```typescript
import { IsString, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator'

export class CreateUserDto {
  /**
   * User email address
   * @example user@example.com
   */
  @IsEmail()
  email: string

  /**
   * User full name
   * @example John Doe
   */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string

  /**
   * User phone number
   * @example +1234567890
   */
  @IsOptional()
  @IsString()
  phone?: string
}
```

**Lines saved**: 20 lines → 14 lines (30% reduction)

### Controller Example

**Before**:
```typescript
@Post()
@ApiOperation({ summary: 'Create a new user' })
@ApiResponse({ status: 201, description: 'User created successfully', type: User })
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({ status: 409, description: 'Email already exists' })
create(@Body() dto: CreateUserDto) {
  return this.service.create(dto)
}
```

**After** (with comments):
```typescript
/**
 * Create a new user
 */
@Post()
create(@Body() dto: CreateUserDto) {
  return this.service.create(dto)
}
```

The plugin automatically adds response decorators based on return types and HTTP methods.

## Benefits

### 1. **Less Boilerplate**
- ~30-50% reduction in decorator code
- Cleaner, more readable DTOs
- Fewer imports needed

### 2. **Automatic Type Safety**
- Plugin reads TypeScript types directly
- No manual type declaration needed
- Prevents type mismatches

### 3. **Validation Integration**
- Automatically sync with `class-validator`
- No duplicate validation rules
- Single source of truth

### 4. **Better DX**
- Write less, get more
- Focus on business logic
- Easier to maintain

### 5. **Consistency**
- Standardized documentation format
- Reduces human error
- Enforces best practices

## Testing After Migration

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Check Swagger UI**:
   ```bash
   npm run start:dev
   # Visit http://localhost:4040/api/docs
   ```

3. **Verify**:
   - ✅ All DTOs appear in Swagger
   - ✅ Required/optional fields are correct
   - ✅ Types and formats are accurate
   - ✅ Examples show properly
   - ✅ Descriptions from comments appear
   - ✅ Validation rules (min/max) are documented

## Troubleshooting

### Issue: Changes not reflected
**Solution**: Restart the dev server. The plugin runs at compile-time.
```bash
# Stop and restart
npm run start:dev
```

### Issue: Some fields not appearing
**Solution**: Ensure file naming matches `dtoFileNameSuffix`:
- ✅ `*.dto.ts`
- ✅ `*.entity.ts`
- ❌ `*.model.ts` (not configured)

### Issue: Comments not showing
**Solution**: Use proper JSDoc format:
```typescript
/**
 * This will work
 */
field: string

// This won't work
field: string
```

### Issue: Need to hide a property
**Solution**: Use `@ApiHideProperty()`:
```typescript
import { ApiHideProperty } from '@nestjs/swagger'

@ApiHideProperty()
internalField: string
```

## Rollback Plan

If you need to disable the plugin:

1. Remove plugin from `nest-cli.json`:
```json
{
  "compilerOptions": {
    "plugins": []  // Empty array
  }
}
```

2. Restart the dev server
3. Manual `@ApiProperty()` decorators will work as before

## Best Practices

### 1. Use JSDoc Comments
```typescript
/**
 * Clear description of the field
 * @example sample-value
 */
field: string
```

### 2. Keep Complex Metadata
For complex schemas, keep manual decorators:
```typescript
@ApiProperty({
  description: 'Complex nested object',
  schema: {
    type: 'object',
    properties: {
      // Custom schema
    }
  }
})
metadata: Record<string, any>
```

### 3. Use @ApiHideProperty Sparingly
Only hide truly internal fields:
```typescript
@ApiHideProperty()
@Exclude()  // Also exclude from response
passwordHash: string
```

### 4. Validate After Changes
Always check Swagger UI after modifying DTOs.

## Migration Checklist

- [x] Enable plugin in `nest-cli.json`
- [ ] Test build: `npm run build`
- [ ] Verify Swagger UI: http://localhost:4040/api/docs
- [ ] Review existing DTOs (optional)
- [ ] Migrate new DTOs to simplified format
- [ ] Update team documentation
- [ ] Remove redundant decorators (gradual)

## References

- [NestJS Swagger Plugin Docs](https://docs.nestjs.com/openapi/cli-plugin)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Class Validator Decorators](https://github.com/typestack/class-validator#validation-decorators)

## Next Steps

1. **Build & Test**:
   ```bash
   npm run build
   npm run start:dev
   ```

2. **Review Swagger UI** at http://localhost:4040/api/docs

3. **Gradually migrate** new DTOs to use JSDoc comments

4. **Optional**: Refactor existing DTOs to remove redundant decorators

---

**Status**: ✅ Plugin Enabled  
**Impact**: Non-breaking - works alongside existing decorators  
**Recommendation**: Use simplified format for new code
