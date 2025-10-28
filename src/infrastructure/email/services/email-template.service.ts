import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  EmailTemplate,
  EmailTemplateContext,
} from '../interfaces/email-template.interface';

@Injectable()
export class EmailTemplateService {
  private templateCache: Map<EmailTemplate, HandlebarsTemplateDelegate> =
    new Map();
  private readonly templatesPath: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(EmailTemplateService.name)
    private readonly logger: PinoLogger,
  ) {
    this.templatesPath = path.join(
      __dirname,
      '..',
      'templates',
    );
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Format date helper
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Current year helper
    Handlebars.registerHelper('currentYear', () => {
      return new Date().getFullYear();
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    // Conditional equals helper
    Handlebars.registerHelper('eq', (a, b) => {
      return a === b;
    });
  }

  /**
   * Load and compile a template
   */
  private loadTemplate(template: EmailTemplate): HandlebarsTemplateDelegate {
    try {
      // Check cache first
      if (this.templateCache.has(template)) {
        return this.templateCache.get(template)!;
      }

      // Load template file
      const templatePath = path.join(
        this.templatesPath,
        `${template}.hbs`,
      );

      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);

      // Cache the compiled template
      this.templateCache.set(template, compiledTemplate);

      this.logger.debug(
        { template, path: templatePath },
        'Email template loaded and cached',
      );

      return compiledTemplate;
    } catch (error) {
      this.logger.error(
        { template, error: error.message },
        'Failed to load email template',
      );
      throw error;
    }
  }

  /**
   * Render a template with context
   */
  async render(
    template: EmailTemplate,
    context: EmailTemplateContext,
  ): Promise<string> {
    try {
      // Add default context values
      const enrichedContext: EmailTemplateContext = {
        appName: this.configService.get<string>('app.name', 'Susanoo'),
        appUrl: this.configService.get<string>('app.url', 'http://localhost:4040'),
        supportEmail: this.configService.get<string>(
          'email.supportEmail',
          'support@susano.dev',
        ),
        securityEmail: this.configService.get<string>(
          'email.securityEmail',
          'security@susano.dev',
        ),
        year: new Date().getFullYear(),
        ...context,
      };

      const compiledTemplate = this.loadTemplate(template);
      const html = compiledTemplate(enrichedContext);

      this.logger.debug(
        { template, contextKeys: Object.keys(context) },
        'Email template rendered successfully',
      );

      return html;
    } catch (error) {
      this.logger.error(
        { template, error: error.message },
        'Failed to render email template',
      );
      throw error;
    }
  }

  /**
   * Clear template cache (useful for development/testing)
   */
  clearCache(): void {
    this.templateCache.clear();
    this.logger.info('Email template cache cleared');
  }

  /**
   * Preload all templates (useful for production startup)
   */
  async preloadTemplates(): Promise<void> {
    const templates = Object.values(EmailTemplate);
    
    for (const template of templates) {
      try {
        this.loadTemplate(template);
      } catch (error) {
        this.logger.warn(
          { template, error: error.message },
          'Failed to preload template',
        );
      }
    }

    this.logger.info(
      { count: this.templateCache.size },
      'Email templates preloaded',
    );
  }
}
