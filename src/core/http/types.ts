import type http from 'http';

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Request, RequestHandler, Response } from 'express';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteContextBase {
  framework: 'express' | 'fastify';
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
}

export interface ExpressRouteContext extends RouteContextBase {
  raw: Request;
  reply: Response;
}

export interface FastifyRouteContext extends RouteContextBase {
  raw: FastifyRequest;
  reply: FastifyReply;
}

export type RouteContext = ExpressRouteContext | FastifyRouteContext;

export interface RouteResponse {
  status?: number;
  body?: unknown;
  /**
   * Set ke true bila handler sudah menangani response secara manual
   * (misalnya untuk stream SSE).
   */
  raw?: boolean;
}

export type RouteHandler = (ctx: RouteContext) => Promise<RouteResponse> | RouteResponse;

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

export interface ModuleOptions {
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export interface ModuleBuildResult {
  routes: RouteDefinition[];
  options?: ModuleOptions;
}

export type ModuleFactoryResult = ModuleBuildResult | RouteDefinition[];
export type ModuleFactory = () => ModuleFactoryResult;

export interface GlobalMiddleware {
  express?: RequestHandler;
  fastify?: (instance: FastifyInstance) => Promise<void> | void;
}

export interface ModuleDefinition extends ModuleBuildResult {
  prefix: string;
}

export interface SocketAdapter {
  onReady(server: http.Server): Promise<void> | void;
  onShutdown?(): Promise<void> | void;
}

export interface HttpServer {
  register(module: ModuleDefinition): void;
  registerGlobalMiddleware(middleware: GlobalMiddleware): void;
  setErrorHandler(handler: unknown): void;
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  registerSocketAdapter?(adapter: SocketAdapter): void;
}
