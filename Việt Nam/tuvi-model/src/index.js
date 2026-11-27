'use strict';

const schema = require('./schema');
const validator = require('./validator');
const rag = require('./rag');
const contextBuilder = require('./context-builder');
const mockAdapter = require('./adapters/mock');
const openAiAdapter = require('./adapters/openai-compatible');
const pipeline = require('./pipeline');
const training = require('./training');

module.exports = {
  ...schema,
  ...validator,
  ...rag,
  ...contextBuilder,
  ...mockAdapter,
  ...openAiAdapter,
  ...pipeline,
  ...training,
};
