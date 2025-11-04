# Security Validation Layer

Comprehensive input sanitization and validation following NestJS best practices.

## Architecture

```
src/shared/
├── decorators/
│   └── sanitization.decorator.ts  # Custom class-validator decorators
└── pipes/
    ├── sanitization.pipe.ts        # Global sanitization pipes
    └── file-validation.pipe.ts     # File upload validation
```

## Features

- ✅ **No class-transformer dependency** for sanitization (using class-validator only)
- ✅ **XSS Prevention** with DOMPurify integration
- ✅ **SQL Injection Protection** (basic layer)
- ✅ **File Upload Validation** with magic number verification
- ✅ **Payload Size Limits**
- ✅ **Custom Validators** using class-validator's `registerDecorator`

## Usage Examples

### 1. Sanitization Decorators

```typescript
import { IsString, IsEmail, MaxLength } from 'class-validator'
import {
  SanitizeHtml,
  Trim,
  SanitizeEmail,
  AlphanumericOnly,
  SanitizeFilename
} from '@shared/decorators'

export class CreateStoryDto {
  @Trim()
  @SanitizeHtml({
    allowedTags: ['p', 'strong', 'em', 'a'],
    allowedAttributes: { a: ['href', 'title'] }
  })
  @IsString()
  @MaxLength(50000)
  content: string

  @Trim()
  @SanitizeHtml({ stripTags: true }) // Remove all HTML
  @IsString()
  @MaxLength(200)
  excerpt: string

  @Trim()
  @AlphanumericOnly('-_') // Allow only alphanumeric, hyphens, underscores
  @IsString()
  @MaxLength(100)
  slug: string
}

export class CreateUserDto {
  @Trim()
  @SanitizeEmail() // Lowercase + trim
  @IsEmail()
  email: string

  @Trim()
  @IsString()
  @MaxLength(100)
  name: string
}

export class UploadFileDto {
  @SanitizeFilename() // Prevent directory traversal
  @IsString()
  filename: string
}
```

### 2. Global Sanitization Pipe

Apply to all routes:

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common'
import { SanitizationPipe } from '@shared/pipes'

app.useGlobalPipes(
  new SanitizationPipe(), // Sanitize first
  new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true }
  })
)
```

### 3. HTML Sanitization Pipe

For specific endpoints accepting rich text:

```typescript
import { HtmlSanitizationPipe } from '@shared/pipes'

@Post('stories')
@UsePipes(new HtmlSanitizationPipe())
async createStory(@Body() dto: CreateStoryDto) {
  return this.storiesService.create(dto)
}
```

### 4. Payload Size Limits

```typescript
import { PayloadSizePipe } from '@shared/pipes'

@Post('upload')
@UsePipes(new PayloadSizePipe(5 * 1024 * 1024)) // 5MB limit
async uploadData(@Body() data: any) {
  return this.service.process(data)
}
```

### 5. File Upload Validation

```typescript
import {
  FileValidationPipe,
  ImageValidationPipe,
  DocumentValidationPipe
} from '@shared/pipes'

@Post('upload/image')
@UseInterceptors(FileInterceptor('file'))
async uploadImage(
  @UploadedFile(new ImageValidationPipe(5 * 1024 * 1024)) // 5MB max
  file: Express.Multer.File
) {
  return this.attachmentsService.uploadImage(file)
}

@Post('upload/document')
@UseInterceptors(FileInterceptor('file'))
async uploadDocument(
  @UploadedFile(
    new DocumentValidationPipe(20 * 1024 * 1024) // 20MB max
  )
  file: Express.Multer.File
) {
  return this.attachmentsService.uploadDocument(file)
}

// Custom file validation
@Post('upload/custom')
@UseInterceptors(FileInterceptor('file'))
async uploadCustom(
  @UploadedFile(
    new FileValidationPipe({
      maxSize: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      allowedExtensions: ['.png', '.jpg'],
      requireMagicNumberMatch: true // Verify via file content, not just extension
    })
  )
  file: Express.Multer.File
) {
  return this.service.process(file)
}
```

## Available Sanitization Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@SanitizeHtml(options?)` | XSS prevention with DOMPurify | `@SanitizeHtml({ allowedTags: ['p'] })` |
| `@Trim()` | Remove whitespace | `@Trim()` |
| `@ToLowerCase()` | Convert to lowercase | `@ToLowerCase()` |
| `@ToUpperCase()` | Convert to uppercase | `@ToUpperCase()` |
| `@SanitizeSql()` | Basic SQL injection prevention | `@SanitizeSql()` |
| `@AlphanumericOnly(chars?)` | Allow only alphanumeric + specified chars | `@AlphanumericOnly('-_.')` |
| `@SanitizeEmail()` | Normalize email (lowercase + trim) | `@SanitizeEmail()` |
| `@SanitizeUrl(protocols?)` | Validate URL protocols | `@SanitizeUrl(['https'])` |
| `@RemoveScripts()` | Remove script tags & event handlers | `@RemoveScripts()` |
| `@SanitizeFilename()` | Prevent directory traversal | `@SanitizeFilename()` |

## How It Works

### Class Validator Integration

The decorators use `class-validator`'s `registerDecorator` API to:

1. **Run during validation** (not transformation)
2. **Mutate the object property** with sanitized value
3. **Always return true** (they sanitize, not validate)
4. **Work with existing validators** (`@IsString()`, `@IsEmail()`, etc.)

### Execution Order

```typescript
export class CreateDto {
  @Trim()              // 1. Trim whitespace
  @SanitizeHtml()      // 2. Sanitize HTML
  @IsString()          // 3. Validate it's a string
  @MaxLength(1000)     // 4. Validate length
  content: string
}
```

Decorators execute **bottom to top**, so place sanitization decorators **above** validation decorators.

## Security Best Practices

1. **Defense in Depth**
   - Sanitization decorators are ONE layer
   - Always use parameterized queries (TypeORM does this)
   - Validate file types via magic numbers, not just extensions
   - Implement rate limiting and request size limits

2. **HTML Sanitization**
   - Use `@SanitizeHtml()` for user-generated content
   - Configure `allowedTags` based on your needs
   - Consider `stripTags: true` for plain text fields

3. **File Upload Security**
   - Always use `requireMagicNumberMatch: true` (verifies file content)
   - Set appropriate `maxSize` limits
   - Whitelist `allowedMimeTypes` and `allowedExtensions`
   - Store uploaded files outside web root

4. **SQL Injection**
   - `@SanitizeSql()` is a basic layer
   - TypeORM's parameterized queries are your main defense
   - Never concatenate user input into raw SQL

## Performance

- **Minimal overhead**: Decorators run during validation (already in the pipeline)
- **DOMPurify**: Fast and battle-tested XSS prevention
- **Caching**: Validator constraints are cached by class-validator

## Testing

```typescript
import { validate } from 'class-validator'
import { plainToClass } from 'class-transformer'

describe('Sanitization Decorators', () => {
  it('should sanitize HTML content', async () => {
    const dto = plainToClass(CreateStoryDto, {
      content: '<script>alert("XSS")</script><p>Safe content</p>'
    })

    await validate(dto)

    expect(dto.content).toBe('<p>Safe content</p>')
  })

  it('should trim whitespace', async () => {
    const dto = plainToClass(CreateUserDto, {
      email: '  test@example.com  '
    })

    await validate(dto)

    expect(dto.email).toBe('test@example.com')
  })
})
```

## Migration from Existing DTOs

### Before (no sanitization):
```typescript
export class CreateStoryDto {
  @IsString()
  @MaxLength(50000)
  content: string
}
```

### After (with sanitization):
```typescript
export class CreateStoryDto {
  @Trim()
  @SanitizeHtml({
    allowedTags: ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li']
  })
  @IsString()
  @MaxLength(50000)
  content: string
}
```

**Note**: Sanitization decorators are opt-in. Add them gradually to DTOs that handle user input.

## Dependencies

- `class-validator` - Validation framework (already in NestJS)
- `isomorphic-dompurify` - HTML sanitization
- `file-type` - MIME type detection via magic numbers
- `ajv` + `ajv-formats` - JSON schema validation (optional)

**No dependency on `class-transformer`** for sanitization logic (only where NestJS requires it).
