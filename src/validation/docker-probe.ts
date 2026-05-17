export interface DockerProbe {
  volumeExists(name: string): Promise<boolean>;
  secretExists(name: string): Promise<boolean>;
}
