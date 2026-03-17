// /**
//  * Utility functions for converting resource references to health wallet links
//  */

// // Resource type mapping for health wallet links
// const RESOURCE_TYPE_MAP: Record<string, string> = {
//   'Condition': 'conditions',
//   'MedicationRequest': 'medications',
//   'MedicationStatement': 'medications',
//   'Encounter': 'encounters',
//   'Procedure': 'procedures',
//   'Observation': 'observations',
//   'AllergyIntolerance': 'allergies',
//   'DiagnosticReport': 'observations',
//   'Immunization': 'medications'
// };

// /**
//  * Extract resource ID from text like "(Resource ID: de044809-d0f0-4c7a-bd56-f38c916c6784)"
//  */
// export function extractResourceId(text: string): string | null {
//   const match = text.match(/\(Resource ID:\s*([a-f0-9-]+)\)/i);
//   return match ? match[1] : null;
// }

// /**
//  * Find all resource references in text
//  */
// export function findAllResourceReferences(text: string): string[] {
//   const matches = text.match(/\(Resource ID:\s*([a-f0-9-]+)\)/gi) || [];
//   return matches.map(match => {
//     const idMatch = match.match(/([a-f0-9-]+)/);
//     return idMatch ? idMatch[1] : '';
//   }).filter(id => id);
// }

// /**
//  * Get resource type from FHIR resource
//  */
// export function getResourceType(resource: any): string {
//   return resource.resourceType || 'Unknown';
// }

// /**
//  * Get display name for resource based on type
//  */
// export function getResourceDisplayName(resource: any): string {
//   const resourceType = resource.resourceType;
  
//   switch (resourceType) {
//     case 'Condition':
//       return resource.code?.coding?.[0]?.display || resource.code?.text || 'Unknown Condition';
    
//     case 'MedicationRequest':
//     case 'MedicationStatement':
//       return resource.medicationCodeableConcept?.coding?.[0]?.display || 
//              resource.medicationCodeableConcept?.text || 
//              resource.medicationReference?.display || 
//              'Unknown Medication';
    
//     case 'Encounter':
//       return resource.class?.display || resource.type?.[0]?.coding?.[0]?.display || 'Unknown Encounter';
    
//     case 'Procedure':
//       return resource.code?.coding?.[0]?.display || resource.code?.text || 'Unknown Procedure';
    
//     case 'Observation':
//       return resource.code?.coding?.[0]?.display || resource.code?.text || 'Unknown Observation';
    
//     case 'AllergyIntolerance':
//       return resource.code?.coding?.[0]?.display || resource.code?.text || 'Unknown Allergy';
    
//     case 'DiagnosticReport':
//       return resource.code?.coding?.[0]?.display || resource.code?.text || 'Unknown Report';
    
//     default:
//       return resource.id || 'Unknown Resource';
//   }
// }

// /**
//  * URL encode a string for health wallet links
//  */
// export function urlEncodeForHealthWallet(text: string): string {
//   return encodeURIComponent(text).replace(/'/g, '%27').replace(/"/g, '%22');
// }

// /**
//  * Create health wallet link for a resource
//  */
// export function createHealthWalletLink(resource: any): string {
//   const resourceType = getResourceType(resource);
//   const mappedType = RESOURCE_TYPE_MAP[resourceType];
  
//   if (!mappedType) {
//     return '';
//   }
  
//   const displayName = getResourceDisplayName(resource);
//   const encodedName = urlEncodeForHealthWallet(displayName);
  
//   return `[${displayName}](healthwallet://${mappedType}/${encodedName})`;
// }

// /**
//  * Convert resource references in text to health wallet links
//  * This function takes text with resource references and converts them to clickable links
//  */
// export async function convertResourceReferencesToLinks(
//   text: string, 
//   getResourceById: (id: string) => Promise<any>
// ): Promise<string> {
//   let result = text;
//   const resourceIds = findAllResourceReferences(text);
  
//   // Process each resource reference asynchronously
//   for (const resourceId of resourceIds) {
//     const referencePattern = new RegExp(`\\(Resource ID:\\s*${resourceId}\\)`, 'gi');
//     const matches = result.match(referencePattern);
    
//     if (matches) {
//       try {
//         // Fetch the actual resource data
//         const resource = await getResourceById(resourceId);
        
//         let replacement: string;
//         if (!resource) {
//           // Fallback if resource not found
//           replacement = `[View Resource](healthwallet://resource/${resourceId})`;
//         } else {
//           // Create proper health wallet link
//           replacement = createHealthWalletLink(resource);
//         }
        
//         // Replace all occurrences of this resource ID
//         result = result.replace(referencePattern, replacement);
        
//       } catch (error) {
//         console.warn(`Failed to fetch resource ${resourceId}:`, error);
//         // Fallback on error
//         const fallback = `[View Resource](healthwallet://resource/${resourceId})`;
//         result = result.replace(referencePattern, fallback);
//       }
//     }
//   }
  
//   return result;
// }

// /**
//  * Process model response to add health wallet links
//  * This is the main function to use in the strategy
//  */
// export async function processModelResponseWithLinks(
//   response: string,
//   getResourceById: (id: string) => Promise<any>
// ): Promise<string> {
//   return convertResourceReferencesToLinks(response, getResourceById);
// }
