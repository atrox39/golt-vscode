const path = require('path');
const fs = require('fs');

module.exports = function init(modules) {
  return {
    create(info) {
      const logger = info.project.projectService.logger;
      logger.info("[Golt Plugin] Initializing Golt Runtime Support...");
      
      return info.languageService;
    },

    getExternalFiles(project) {
      const logger = project.projectService.logger;
      const projectPath = project.getCurrentDirectory();
      
      const hasGolt = fs.existsSync(path.join(projectPath, 'golt.json'));

      if (hasGolt) {
        const typesPath = path.resolve(__dirname, 'golt.d.ts');
        logger.info(`[Golt Plugin] Golt project detected. Injecting global types: ${typesPath}`);
        return [typesPath];
      }

      return [];
    }
  };
};
