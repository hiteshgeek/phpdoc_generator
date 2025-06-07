// Types for docblock parsing/building
export interface ParamDoc {
  name: string;
  type?: string;
  desc?: string;
}

export interface DocblockInfo {
  summary: string;
  params: ParamDoc[];
  returnType?: string;
  returnDesc?: string;
  lines?: string[];
  settings?: string[];
  otherTags?: string[];
}
