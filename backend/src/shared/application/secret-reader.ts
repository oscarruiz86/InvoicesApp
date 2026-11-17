export interface SecretReader {
  read(reference: string): Promise<string>;
}
