export type CreateRecordingBody = {
  title?: string; 
};

export type CreateRecordingResponse = {
  recording: {
    id: string;
    title?: string;
    status: string;     
    createdAt: string; 
  };
};
