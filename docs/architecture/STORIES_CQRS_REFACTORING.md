# Stories Service Refactoring & Architecture

## Overview

The `StoriesService` was identified as a "God Class" (exceeding 1300 lines) handling disparate concerns: core CRUD, complex relationship management (tags, categories, attachments), and data enrichment (media signing). To improve maintainability and testability, we implemented a **Service Decomposition** strategy.

## Implemented Architecture

The monolithic service has been split into three focused services:

### 1. StoriesService (Core & Orchestration)

**Role**: Coordinator and Facade.
**Status**: Active (Refactored)
**Responsibilities**:

- Core CRUD operations (`create`, `update`, `delete`, `restore`).
- Transaction management.
- High-level orchestration of creation/update flows.
- Validating business rules related to story state (e.g., status transitions).
- Delegating specific tasks to specialized services.

**Dependencies**:

- `StoryRepository`
- `StoryRelationshipService`
- `StoryEnrichmentService`

### 2. StoryRelationshipService

**Role**: Complex Relationship Management.
**Status**: Active (New)
**Responsibilities**:

- Managing Many-to-Many relationships:
  - **Tags**: Resolution (find or create), Attachment, Detachment.
  - **Categories**: Attachment, Detachment.
  - **Attachments**: Attachment, Detachment, Main Image management.
- Handling bulk operations for relationships.
- Ensuring integrity of relationship data.

**Key Methods**:

- `attachTags`, `detachTags`, `getTags`
- `attachCategories`, `detachCategories`, `getCategories`
- `attachAttachments`, `detachAttachments`, `getAttachments`

### 3. StoryEnrichmentService

**Role**: Data Transformation & Enrichment.
**Status**: Active (New)
**Responsibilities**:

- Post-read processing of Story entities.
- Generating pre-signed URLs for private S3 media assets.
- Formatting DTOs for standard API responses.
- decoupling presentation/response logic from storage logic.

**Key Methods**:

- `enrichStoryMedia`
- `enrichStoriesCollection`

## Architectural Decision: Decomposition vs. Full CQRS

The initial plan proposed a full **CQRS (Command Query Responsibility Segregation)** pattern with separate `StoryCommandService` and `StoryQueryService`.

**Decision**: We opted for **Service Decomposition** first because:

1.  **Immediate Value**: It solved the monolithic "God Class" problem immediately by extracting the bulk of the complexity (relationships & enrichment) without requiring a complete rewrite of the API layer.
2.  **Lower Complexity**: Full CQRS introduces overhead (separate models, potential eventual consistency handling). The current decomposition maintains Transactional Consistency which is crucial for the Admin-heavy workflows of this module.
3.  **Future-Proof**: This structure is a stepping stone. If read/write loads diverge significantly in the future, `StoriesService` can be easily split into Command/Query services because the complex internal logic is already isolated in `StoryRelationshipService`.

## Current State

- **Refactoring Status**: ✅ Complete
- **Build Status**: ✅ Verified
- **Controller Layer**: The `StoriesController` now injects `StoryRelationshipService` directly for relationship-specific endpoints, reducing the responsibilities of the main `StoriesService`.

## Future Improvements

- **Unit Testing**: Dedicated unit tests should be added for `StoryRelationshipService` and `StoryEnrichmentService` now that they are isolated.
- **Permission Layer**: Integration with CASL is currently partial; future work should standardize permission checks within these services.
