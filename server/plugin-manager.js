/**
 * 插件管理器 - 可插拔式架构
 * 支持动态注册/卸载插件，统一管理所有能力模块
 */
class PluginManager {
  constructor() {
    this.plugins = new Map();
  }

  register(plugin) {
    if (!plugin.name) throw new Error('Plugin must have a name');
    this.plugins.set(plugin.name, {
      ...plugin,
      enabled: true,
    });
    console.log(`[PluginManager] Registered: ${plugin.name}`);
  }

  get(name) {
    const plugin = this.plugins.get(name);
    if (!plugin || !plugin.enabled) return null;
    return plugin;
  }

  async execute(name, method, ...args) {
    const plugin = this.get(name);
    if (!plugin) throw new Error(`Plugin "${name}" not found or disabled`);
    if (typeof plugin[method] !== 'function') {
      throw new Error(`Plugin "${name}" has no method "${method}"`);
    }
    return plugin[method](...args);
  }

  list() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      description: p.description,
      enabled: p.enabled,
    }));
  }

  disable(name) {
    const plugin = this.plugins.get(name);
    if (plugin) plugin.enabled = false;
  }

  enable(name) {
    const plugin = this.plugins.get(name);
    if (plugin) plugin.enabled = true;
  }
}

export default new PluginManager();
