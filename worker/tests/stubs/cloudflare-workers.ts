// Stands in for the runtime's `cloudflare:workers` module when the tests are bundled for Node.
export class DurableObject<Env = unknown> {
  constructor(
    protected ctx: unknown,
    protected env: Env
  ) {}
}
