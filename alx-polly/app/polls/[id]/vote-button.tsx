'use client';

import { Button } from '@/components/ui/button';
import { voteForOption } from '@/lib/actions';
import { useState } from 'react';

interface VoteButtonProps {
  optionId: string;
  pollId: string;
}

export default function VoteButton({ optionId, pollId }: VoteButtonProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async () => {
    try {
      setIsVoting(true);
      setError(null);
      const result = await voteForOption(optionId, pollId);
      
      if (!result.success) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to vote');
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleVote}
        disabled={isVoting}
      >
        {isVoting ? 'Voting...' : 'Vote'}
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}