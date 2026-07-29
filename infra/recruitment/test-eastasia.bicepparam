using './main.bicep'

// ShoreVest recruitment non-production foundation.
// No subscription IDs, tenant IDs, credentials or secret values belong in this file.
param environmentName = 'test'
param namePrefix = 'svrc26hk'
param location = 'eastasia'

// Paid and externally visible capabilities remain disabled for the foundation deployment.
param enableDefenderForStorage = false
param enableCosmosServerless = true

// Runtime safety and test cost controls.
param botVerificationHostname = 'shorevest.com'
param rateLimitCount = 5
param rateLimitWindowSeconds = 300
param maxBodyBytes = 65536
param maximumInstanceCount = 2
param instanceMemoryMB = 2048
