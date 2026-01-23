


export interface CastErrorDetails {
  path?: string;
  value?: string | number | null;
  kind?: string;
}


export type ErrorDetails = 
  | CastErrorDetails
  | Record<string, string | number | boolean | null | undefined>
  | string
  | number
  | boolean
  | null;
