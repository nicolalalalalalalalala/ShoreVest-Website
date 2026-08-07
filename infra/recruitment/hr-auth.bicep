targetScope = 'resourceGroup'

@description('Existing recruitment Azure Function App.')
param functionAppName string

@description('Microsoft Entra application registration client ID used by App Service Authentication.')
param entraClientId string

@description('Tenant-specific OpenID Connect issuer.')
param openIdIssuer string = 'https://login.microsoftonline.com/${tenant().tenantId}/v2.0'

@description('Allowed token audiences for the recruitment API registration.')
param allowedAudiences array = [
  'api://${entraClientId}'
]

resource functionApp 'Microsoft.Web/sites@2024-04-01' existing = {
  name: functionAppName
}

// Public candidate endpoints remain anonymous. Easy Auth validates any supplied
// Entra token and injects the trusted x-ms-client-principal header. The HR route
// then requires the exact Recruitment.HR application role in server code.
resource authSettings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
    globalValidation: {
      requireAuthentication: false
      unauthenticatedClientAction: 'AllowAnonymous'
      redirectToProvider: 'azureactivedirectory'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraClientId
          openIdIssuer: openIdIssuer
        }
        validation: {
          allowedAudiences: allowedAudiences
        }
      }
    }
    login: {
      preserveUrlFragmentsForLogins: false
      tokenStore: {
        enabled: false
      }
    }
    httpSettings: {
      requireHttps: true
      routes: {
        apiPrefix: '/.auth'
      }
      forwardProxy: {
        convention: 'NoProxy'
      }
    }
  }
}

output authSettingsId string = authSettings.id
output configuredAudience array = allowedAudiences
