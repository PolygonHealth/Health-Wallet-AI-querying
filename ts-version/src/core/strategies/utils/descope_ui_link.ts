const UI_SUPPORTED_RESOURCE_TYPES = [
    'observation',
    'condition',
    'medication',
    'encounter',
    'procedure',
    'allergy',
  ] as const;
  
  type SupportedResourceType = typeof UI_SUPPORTED_RESOURCE_TYPES[number];
  
  /**
   * Finds all markdown links in the answer, checks if healthwallet:// links
   * point to a supported resource type, and strips unsupported ones down to
   * plain text — leaving the display name intact.
   *
   * [link text](healthwallet://unsupported/foo)  →  link text
   * [link text](healthwallet://conditions/foo)   →  [link text](healthwallet://conditions/foo)
   * [link text](https://external.com)            →  [link text](https://external.com)
   */
  export function descopeInlineReferences(answer: string): string {
    const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
    const HEALTHWALLET_RE = /^healthwallet:\/\/([^/]+)\/(.+)$/;
  
    const removed: Array<{ displayText: string; resourceType: string; exactName: string }> = [];
  
    const result = answer.replace(MARKDOWN_LINK_RE, (fullMatch, displayText: string, url: string) => {
      const hwMatch = url.match(HEALTHWALLET_RE);
      if (!hwMatch) return fullMatch;
  
      const resourceType = hwMatch[1].toLowerCase();
      const exactName = decodeURIComponent(hwMatch[2]);
  
      if ((UI_SUPPORTED_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
        return fullMatch;
      }
  
      removed.push({ displayText, resourceType, exactName });
      return displayText;
    });
  
    if (removed.length > 0) {
      console.log(
        `[descopeInlineReferences] Stripped ${removed.length} unsupported healthwallet link(s):`,
        removed.map(r => `${r.resourceType}/${r.exactName}`).join(', ')
      );
    }
  
    return result;
  }