/// <reference path="../../types/eagle-plugin-api.d.ts" />

eagle.onPluginCreate((plugin) => {
  eagle.log.info(`[${plugin.manifest.name}] created`);
});

eagle.onPluginRun(() => {
  eagle.log.info("plugin run");
});

eagle.onPluginShow(() => {
  eagle.log.info("plugin shown");
});

eagle.onPluginHide(() => {
  eagle.log.info("plugin hidden");
});

eagle.onPluginBeforeExit(() => {
  eagle.log.info("plugin exiting");
});
