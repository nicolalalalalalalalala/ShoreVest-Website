'use strict';

const { app } = require('@azure/functions');
const { loadConfig } = require('../lib/config');
const { safeErrorCode } = require('../lib/logger');
const { withCors } = require('../lib/http');
const { createDeps } = require('../appFactory');
const { getApplicationDetails } = require('../hr/applicationDetails');

app.http('hrApplicationDetails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'recruitment/hr/applications/{applicationReference}',
  handler: async (req, context) => {
    const config = loadConfig();
    try {
      const dependencies = createDeps(config);
      const result = await getApplicationDetails(req, config, dependencies);
      return { ...result, headers: withCors(req, config) };
    } catch (error) {
      context.error('recruitment_hr_application_details_failed', { code: safeErrorCode(error) });
      return {
        status: 500,
        headers: withCors(req, config),
        jsonBody: { success: false, errorCode: 'HR_APPLICATION_DETAILS_FAILED' }
      };
    }
  }
});
