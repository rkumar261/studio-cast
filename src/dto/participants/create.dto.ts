export type CreateParticipantRequestBody = {

    role: 'host' | 'guest';
    displayName: string;
    email?: string;
};

export type CreateParticipantResponse = {
    participant: {
        id: string;
        recordingId: string;
        role: 'host' | 'guest';
        displayName?: string;
        email?: string;
    };
    magicLink?: string; // only for guests
};