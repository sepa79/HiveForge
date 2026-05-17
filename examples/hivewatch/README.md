# HiveWatch POC Fixture

This fixture is a local HiveWatch-shaped repository for HiveForge development.

It is not the real HiveWatch repository. It exists so contract, validation, and
action-runner code can be tested before integrating the real HiveWatch repo.

The allowlist still uses the real HiveWatch repository URL because the
allowlist contract describes approved external repositories. Unit tests use fake
checkout runners when they need this fixture without network access.
