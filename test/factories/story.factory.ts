/**
 * Story test data factory
 * Generate test story data
 */

import { randomUUID } from 'crypto';
import { Story, StoryType, StoryStatus, StoryPriority } from '../../src/stories/entities/story.entity';

export class StoryFactory {
  private static counter = 0;

  /**
   * Create a test story with default values
   */
  static create(overrides: Partial<Story> = {}): Partial<Story> {
    this.counter++;
    const fallbackUserId = overrides.userId || randomUUID();
    
    return {
      title: overrides.title || `Test Story ${this.counter}`,
      details: overrides.details || `This is test story number ${this.counter}`,
      type: overrides.type || StoryType.REPORT,
      status: overrides.status || StoryStatus.DRAFT,
      priority: overrides.priority || StoryPriority.NORMAL,
      userId: fallbackUserId,
      createdBy: overrides.createdBy || fallbackUserId,
      lastModifiedBy: overrides.lastModifiedBy || fallbackUserId,
      ...overrides,
    };
  }

  /**
   * Create multiple test stories
   */
  static createMany(count: number, overrides: Partial<Story> = {}): Partial<Story>[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  /**
   * Create a published story
   */
  static createPublished(overrides: Partial<Story> = {}): Partial<Story> {
    return this.create({
      status: StoryStatus.PUBLISHED,
      ...overrides,
    });
  }

  /**
   * Create a story with specific type
   */
  static createOfType(type: StoryType, overrides: Partial<Story> = {}): Partial<Story> {
    return this.create({
      type,
      ...overrides,
    });
  }

  /**
   * Create a story with tags
   */
  static createWithTags(tagNames: string[], overrides: Partial<Story> = {}): Partial<Story> {
    return this.create({
      ...overrides,
      tags: tagNames.map((name, index) => ({
        id: index + 1,
        name,
        slug: name.toLowerCase(),
      })) as any,
    });
  }

  /**
   * Reset counter (useful between tests)
   */
  static reset(): void {
    this.counter = 0;
  }
}
