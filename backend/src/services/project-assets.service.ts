import type { GetProjectAssetsGraphResponse } from '../dto/recordings/project-assets.dto.js';
import { listParticipantMasterStatesForRecording } from './participant-asset.service.js';
import { buildProjectAssetsGraph } from './project-assets.mapper.js';
import { loadProjectAssetsRecording } from './project-assets.loader.js';

type ServiceResult<T> =
  | { code: 'ok'; data: T }
  | { code: 'not_found' }
  | { code: 'forbidden' };

export async function getProjectAssetsGraphService(args: {
  recordingId: string;
  requesterId: string;
}): Promise<ServiceResult<GetProjectAssetsGraphResponse>> {
  const recording = await loadProjectAssetsRecording(args.recordingId);

  if (!recording) return { code: 'not_found' };
  if (recording.userId && recording.userId !== args.requesterId) return { code: 'forbidden' };

  const participantMasterStates = await listParticipantMasterStatesForRecording(args.recordingId);
  return {
    code: 'ok',
    data: buildProjectAssetsGraph({
      recording,
      participantMasterStates,
    }),
  };
}
