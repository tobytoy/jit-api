/**
 * JIT Protocol Synthesis Framework - Plugins Module
 * 
 * Comprehensive ecosystem of Auth, Storage, Channels, Guardrails, and Tools.
 */

// Authentication Plugins
export * from './auth_supabase.js';
export * from './auth_line.js';
export * from './auth_firebase.js';
export * from './auth_clerk.js';

// Storage Adapters (No-Code, Serverless & Document Stores)
export * from './store_supabase.js';
export * from './store_firestore.js';
export * from './store_googlesheets.js';
export * from './store_notion.js';
export * from './store_upstash.js';

// Communication & Notification Channels
export * from './channel_line.js';
export * from './channel_discord.js';
export * from './channel_telegram.js';
export * from './channel_slack.js';

// Guardrails & Developer Tools
export * from './guard_safety.js';
export * from './guard_spec_linter.js';
export * from './tool_webhook_replay.js';
