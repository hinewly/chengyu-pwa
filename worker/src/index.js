// Static assets only (成语接龙 is a pure front-end game).
// 海外站暂缓部署：配置已就绪，待用户拍板后 wrangler deploy。
export default {
  async fetch(request, env, ctx) {
    return env.ASSETS.fetch(request);
  },
};
