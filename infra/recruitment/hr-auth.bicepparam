using 'hr-auth.bicep'

param functionAppName = 'svplaceholder-recruit-fn-dev'
param entraClientId = '00000000-0000-0000-0000-000000000000'
param allowedAudiences = [
  'api://00000000-0000-0000-0000-000000000000'
]
