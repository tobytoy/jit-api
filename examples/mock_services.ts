import { JITEngine, JITRequestContext, RouteDefinition } from '../core/index.js';

export function registerMockServices(engine: JITEngine): void {
  // Service 1: Create Invoice
  const createInvoiceRoute: RouteDefinition = {
    route: 'create_invoice',
    description: 'Create and issue a new billing invoice for customers',
    intentCriteria:
      'Customer requests to create, issue, or generate an invoice or bill for a product or service transaction',
    enumFields: {
      currency: {
        USD: 'US Dollar ($)',
        EUR: 'Euro (€)',
        TWD: 'New Taiwan Dollar (NT$)',
        JPY: 'Japanese Yen (¥)',
      },
      priority: {
        urgent: 'Immediate processing required',
        normal: 'Standard processing time',
      },
    },
    handler: async (payload: any, ctx: JITRequestContext) => {
      return {
        invoiceId: 'INV-' + Math.floor(100000 + Math.random() * 900000),
        status: 'ISSUED',
        customer: payload.customer || 'Unknown Customer',
        amount: Number(payload.amount ?? 0),
        currency: payload.currency || 'USD',
        priority: payload.priority || 'normal',
        itemCount: Number(payload.itemCount ?? 1),
        processedAt: new Date().toISOString(),
        phaseAtExecution: ctx.phase,
        aiLatencyMs: ctx.aiLatencyMs,
      };
    },
  };

  // Service 2: Check Order Status
  const checkStatusRoute: RouteDefinition = {
    route: 'check_status',
    description: 'Check tracking status of an existing order or invoice',
    intentCriteria:
      'Inquire, track, search, or check the current status or shipment progress of an order or invoice',
    handler: async (payload: any, ctx: JITRequestContext) => {
      return {
        trackingId: payload.trackingId || payload.orderId || 'UNKNOWN-ID',
        status: 'DELIVERED',
        location: 'Taipei Distribution Center',
        phaseAtExecution: ctx.phase,
        aiLatencyMs: ctx.aiLatencyMs,
      };
    },
  };

  engine.register(createInvoiceRoute);
  engine.register(checkStatusRoute);
}
