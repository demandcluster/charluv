"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
require("module-alias/register");
const tokenize_1 = require("./tokenize");
const os = __importStar(require("os"));
const throng_1 = __importDefault(require("throng"));
const ws_1 = require("./api/ws");
const queue_1 = require("./queue");
const app_1 = require("./app");
const config_1 = require("./config");
const db_1 = require("./db");
const client_1 = require("./db/client");
const middleware_1 = require("./middleware");
const domains_1 = require("./domains");
const pkg = require('../package.json');
async function start() {
    // No longer accept requests when shutting down
    // Allow as many responses currently generating to complete as possible during the shutdown window
    // The shutdown window is ~10 seconds
    const { server } = (0, app_1.createApp)();
    process.on('SIGTERM', () => {
        middleware_1.logger.warn(`Received SIGTERM. Server shutting down.`);
        server.close();
    });
    process.on('uncaughtException', (ex) => {
        middleware_1.logger.error({ msg: ex?.message, err: ex, stack: ex.stack }, 'Unhandled exception');
    });
    process.on('unhandledRejection', (ex) => {
        middleware_1.logger.error({ msg: ex?.message, err: ex, stack: ex.stack }, 'Unhandled rejection');
    });
    (0, tokenize_1.prepareTokenizers)();
    await Promise.allSettled([initDb(), (0, ws_1.initMessageBus)()]);
    (0, queue_1.startQueue)();
    server.on('error', (err) => {
        middleware_1.logger.error({ cause: err.message }, 'Failed to start API');
    });
    server.listen(config_1.config.port, config_1.config.host, async () => {
        middleware_1.logger.info({ port: config_1.config.port, version: pkg.version }, `Server started http://127.0.0.1:${config_1.config.port} (Listening: ${config_1.config.host})`);
    });
    if (config_1.config.jsonStorage) {
        middleware_1.logger.info(`JSON storage enabled for guests: ${config_1.config.jsonFolder}`);
    }
}
async function initDb() {
    if (config_1.config.ui.maintenance) {
        middleware_1.logger.warn(`Maintenance mode enabled: Will not connect to database`);
        return;
    }
    const db = await (0, client_1.connect)();
    if (db) {
        await (0, client_1.createIndexes)();
        await (0, domains_1.setupDomain)();
        // Initialise settings if empty
        await db_1.store.users.ensureInitialUser();
    }
}
async function startWorker(id) {
    if (id)
        middleware_1.logger.setBindings({ w_id: id });
    await start().catch((error) => {
        middleware_1.logger.error(error, 'Server startup failed');
        process.exit(1);
    });
}
if (config_1.config.clustering) {
    const count = !isNaN(config_1.config.clusterWorkers) && config_1.config.clusterWorkers > 0
        ? config_1.config.clusterWorkers
        : os.cpus().length;
    middleware_1.logger.info('Using clustering');
    (0, throng_1.default)({
        worker: startWorker,
        lifetime: Infinity,
        count,
        grace: 2000,
        signals: ['SIGTERM', 'SIGINT'],
    });
}
else {
    startWorker();
}
//# sourceMappingURL=start.js.map