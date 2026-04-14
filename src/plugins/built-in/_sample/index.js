const { PluginAPI } = require('../../plugin-api');

class SamplePlugin extends PluginAPI {
  init(context) {
    this.context = context;
    context.commands.register('hello', 'Sample: Hello World', () => {
      console.log('[SamplePlugin] Hello from the plugin system!');
    });
  }
}

module.exports = { Plugin: SamplePlugin };
