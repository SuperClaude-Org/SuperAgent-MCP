import type { z } from "zod";
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Request, Notification, Result } from "@modelcontextprotocol/sdk/types.js";

declare module "@modelcontextprotocol/sdk/server/index.js" {
  type RequestHandlerExtra = {
    signal: AbortSignal;
  };

  interface Server<RequestT extends Request = Request, NotificationT extends Notification = Notification, ResultT extends Result = Result> {
    setRequestHandler<TSchema extends z.ZodObject<{ method: z.ZodLiteral<string> }>>(
      schema: TSchema,
      handler: (request: z.infer<TSchema>, extra: RequestHandlerExtra) => Promise<ResultT> | ResultT
    ): void;

    connect(transport: StdioServerTransport): Promise<void>;
  }
}
