import { Request } from 'express';
import { getDbPool } from '@/db/session';
import { getPatientByProfileId } from '@/db/queries';

// Helper function to get session factory
function getSessionFactory() {
  return getDbPool();
}

// Helper function to get patient ID from headers only
export async function getPatientIdFromHeaders(req: Request): Promise<string> {
  // Try both x-profile-id and id headers
  const profileIdHeader = req.headers['x-profile-id'] || req.headers['id'];
  if (!profileIdHeader) {
    throw new Error('Either patientId in body or x-profile-id/id header is required');
  }
  
  // Convert header to number (it comes as string or array)
  const profileId = typeof profileIdHeader === 'string' 
    ? parseInt(profileIdHeader) 
    : parseInt(Array.isArray(profileIdHeader) ? profileIdHeader[0] : String(profileIdHeader));
  
  if (isNaN(profileId)) {
    throw new Error('Profile ID must be a valid number');
  }
  
  // Get patient from profile ID
  const db = getSessionFactory();
  const patient = await getPatientByProfileId(db, profileId);
  if (!patient) {
    throw new Error(`No patient found for profile ID: ${profileId}`);
  }
  
  return patient.patient_id;
}
