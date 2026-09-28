// Hosted credentials are never returned to the add-in.
function providerConfig(env = process.env) {
  const provider = env.AI_PROVIDER || 'deepseek';
  if (!['deepseek', 'openai'].includes(provider)) throw new Error('AI_PROVIDER must be deepseek or openai.');
  const deepseek = provider === 'deepseek';
  const keyName = deepseek ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY';
  return {
    provider, keyName, key: env[keyName],
    url: deepseek ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions',
    fast: env.AI_MODEL_FAST || (deepseek ? 'deepseek-flash' : env.OPENAI_MODEL_FAST || 'gpt-4o'),
    heavy: env.AI_MODEL_HEAVY || (deepseek ? 'deepseek-flash' : env.OPENAI_MODEL_HEAVY || 'gpt-4o')
  };
}
module.exports = { providerConfig };
