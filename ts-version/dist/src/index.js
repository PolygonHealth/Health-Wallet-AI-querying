"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./api/app");
const settings_1 = require("./config/settings");
const logging_1 = require("./config/logging");
async function startServer() {
    try {
        const app = (0, app_1.createApp)();
        const port = settings_1.config.port;
        app.listen(port, () => {
            logging_1.logger.info(`Server started on port ${port}`);
            logging_1.logger.info(`API docs available at http://localhost:${port}/api-docs`);
            logging_1.logger.info(`Health check at http://localhost:${port}/health`);
        });
    }
    catch (error) {
        logging_1.logger.error('Failed to start server', error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map