import { loadTestEnvironment } from './support/test-environment.js'

// Validate pathname and explicit host before importing any application/test modules.
// Global setup also checks the actual database identity and non-privileged role.
loadTestEnvironment()
