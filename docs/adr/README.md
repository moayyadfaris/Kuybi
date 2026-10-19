# Architecture Decision Records

Each record captures one significant decision: the context, what was decided, and what
it costs. Records are immutable once accepted; a later decision **supersedes** an earlier
one rather than editing it.

| #                                                     | Decision                                                                  | Status                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| [0001](0001-modular-monolith-shared-schema.md)        | Modular monolith on one shared PostgreSQL schema                          | Accepted                |
| [0002](0002-base-modules-never-depend-on-features.md) | Base modules never depend on feature modules                              | Accepted                |
| [0003](0003-data-access-and-cache-contract.md)        | Data access only through the owning repository; one cache contract        | Accepted                |
| [0004](0004-transactional-outbox.md)                  | Background jobs are enqueued through a transactional outbox               | Accepted                |
| [0005](0005-idempotency-keys.md)                      | Idempotency keys for retried unsafe requests                              | Accepted                |
| [0006](0006-domain-events-in-process.md)              | Domain events in process now; broker (Kafka) decision open                | Accepted (broker: open) |
| [0007](0007-fail-closed-configuration.md)             | Configuration fails closed outside development and test                   | Accepted                |
| [0008](0008-one-http-pipeline.md)                     | One HTTP pipeline, one exception filter, one response envelope            | Accepted                |
| [0009](0009-attachment-visibility-and-uploads.md)     | Attachments: public by default, uploader-controlled, ACL follows the flag | Accepted                |

## Writing a new record

Copy [template.md](template.md) to `NNNN-short-title.md` (next number), fill it in, add it
to the table, and link it from the PR that implements it. Write the **Enforcement**
section: a decision nothing checks erodes.
