# HiveWatch POC Fixture

This fixture is a local HiveWatch-shaped repository for HiveForge development.

It is not the real HiveWatch repository. It exists so contract, validation, and
action-runner code can be tested before integrating the real HiveWatch repo.

Run local REST/UI work with the fixture project id `hivewatch-local`.
Lifecycle actions require the environment declared by the component manifest:

```bash
HIVEWATCH_API_PORT=3000
```

The allowlist also contains the real HiveWatch repository URL for read-only
inspection experiments, but the local fixture is the deployable POC target.
