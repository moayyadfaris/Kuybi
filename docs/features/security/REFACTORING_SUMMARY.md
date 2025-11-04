# Security Validation Refactoring - Summary

## Overview
Reorganized security validation layer following NestJS best practices, eliminating dependency on unmaintained `class-transformer` package for sanitization logic.

## Architecture Changes

### Before
```
src/shared/validation/
├── sanitization/
│   ├── sanitize.decorator.ts  (using @Transform from class-transformer)
│   └── sanitization.pipe.ts
├── file/
│   └── file-validation.pipe.ts
└── schema/
    └── json-schema.pipe.ts
```

### After (NestJS Best Practices)
```
src/shared/
├── decorators/
│   ├── sanitization.decorator.ts  (using class-validator's registerDecorator)
│   └── index.ts
├── pipes/
│   ├── sanitization.pipe.ts
│   ├── file-validation.pipe.ts
│   └── index.ts
└── dto/
    └── example-secure.dto.ts
```

## Key Improvements

### 1. No class-transformer Dependency for Sanitization
**Problem**: `class-transformer` is not well maintained (last update 2021)

**Solution**: Use `class-validator`'s `registerDecorator` API instead
- Custom validators that sanitize during validation
- Mutate object properties with cleaned values
- No dependency on `class-transformer` for sanitization logic
- NestJS still uses `class-transformer` internally (unavoidable), but we don't rely on it

### 2. Proper File Organization
- **Decorators** → `/src/shared/decorators/` (modifies behavior/metadata)
- **Pipes** → `/src/shared/pipes/` (transforms & validates in request pipeline)
- Clear separation of concerns following NestJS conventions

### 3. Custom Validator Constraints
Each decorator implements `ValidatorConstraintInterface`:
```typescript
@ValidatorConstraint({ name: 'sanitizeHtml', async: false })
class SanitizeHtmlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    // Sanitize the value
    const sanitized = this.sanitize(value, options)
    
    // Mutate the object property
    const object = args.object as Record<string, unknown>
    object[args.property] = sanitized
    
    return true // Always return true (sanitizing, not validating)
  }
}
```

## Implementation Details

### Sanitization Decorators (9 total)

| Decorator | Implementation | Purpose |
|-----------|----------------|---------|
| `@SanitizeHtml()` | DOMPurify + custom config | XSS prevention |
| `@Trim()` | String.trim() | Whitespace removal |
| `@ToLowerCase()` | String.toLowerCase() | Case normalization |
| `@ToUpperCase()` | String.toUpperCase() | Case normalization |
| `@SanitizeSql()` | RegExp replace | SQL injection prevention |
| `@AlphanumericOnly()` | RegExp replace | Character filtering |
| `@SanitizeEmail()` | toLowerCase + trim | Email normalization |
| `@SanitizeUrl()` | URL validation | Protocol whitelisting |
| `@RemoveScripts()` | RegExp replace | Script tag removal |
| `@SanitizeFilename()` | RegExp replace | Directory traversal prevention |

### Validation Pipes (3 total)

| Pipe | Purpose | Usage |
|------|---------|-------|
| `SanitizationPipe` | Global sanitization (null bytes, control chars) | `app.useGlobalPipes()` |
| `HtmlSanitizationPipe` | HTML sanitization for rich text endpoints | `@UsePipes()` |
| `PayloadSizePipe` | Request size limits (DoS prevention) | `@UsePipes(new PayloadSizePipe(5MB))` |

### File Validation Pipes

| Pipe | Purpose | Features |
|------|---------|----------|
| `FileValidationPipe` | Generic file validation | Magic numbers, size, extension, filename |
| `ImageValidationPipe` | Image-specific validation | Extends FileValidationPipe, 5MB default |
| `DocumentValidationPipe` | Document validation | Extends FileValidationPipe, 20MB default |

## Usage Example

```typescript
import { IsString, IsEmail, MaxLength } from 'class-validator'
import { SanitizeHtml, Trim, SanitizeEmail } from '@shared/decorators'

export class CreateStoryDto {
  @Trim()                    // 1. Remove whitespace
  @SanitizeHtml({            // 2. Clean HTML (XSS prevention)
    allowedTags: ['p', 'strong', 'em']
  })
  @IsString()                // 3. Validate type
  @MaxLength(50000)          // 4. Validate length
  content: string

  @Trim()
  @SanitizeEmail()           // Lowercase + trim
  @IsEmail()
  authorEmail: string
}
```

## Benefits

1. **Maintainability**: No dependency on unmaintained `class-transformer` for sanitization
2. **Performance**: Sanitization runs during validation (already in the pipeline)
3. **Type Safety**: Full TypeScript support with `class-validator`
4. **Flexibility**: Easy to add custom sanitizers using `registerDecorator`
5. **NestJS Conventions**: Proper file organization (decorators/, pipes/)
6. **Security**: Multiple layers (decorators + pipes + DOMPurify)

## Files Created/Modified

### Created
- `src/shared/decorators/sanitization.decorator.ts` (372 lines)
- `src/shared/decorators/index.ts`
- `src/shared/pipes/sanitization.pipe.ts` (165 lines)
- `src/shared/pipes/file-validation.pipe.ts` (moved from validation/)
- `src/shared/pipes/index.ts`
- `src/shared/dto/example-secure.dto.ts`
- `docs/features/security/VALIDATION.md` (comprehensive guide)

### Modified
- `docs/README.md` (added Security & Validation section)
- `package.json` (removed class-sanitizer, kept existing packages)

### Removed
- `src/shared/validation/` (entire folder - reorganized into decorators/ and pipes/)

## Testing

Build successful:
```bash
npm run build  # ✅ No errors
```

All TypeScript compilation errors resolved:
- ✅ DOMPurify TrustedHTML type handling
- ✅ No unused parameter warnings
- ✅ Proper type casting

## Next Steps

1. **Request Size Limits**: Create `@MaxBodySize()` decorator and guard
2. **Unit Tests**: Test sanitization with XSS/SQL injection attack vectors
3. **Integration Tests**: Test with real DTOs in controllers
4. **Migration**: Gradually add decorators to existing DTOs

## Documentation

Full documentation available at:
- **Main Guide**: `docs/features/security/VALIDATION.md`
- **Quick Reference**: See "Usage Examples" section in main guide
- **API Index**: `docs/README.md` (Security & Validation section)

## Dependencies

**Required** (production):
- `class-validator` - Already in NestJS
- `isomorphic-dompurify` - HTML sanitization
- `file-type` - MIME type detection

**Removed**:
- `class-sanitizer` - Deprecated package (uninstalled)

**Avoided**:
- Heavy reliance on `class-transformer` for sanitization (still used by NestJS internally)
