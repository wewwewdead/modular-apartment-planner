export const getPostsCopy = (count) => {
    if (count === 0) return 'The blank page is waiting';
    if (count === 1) return 'A seed planted';
    if (count >= 7) return 'Your most prolific week!';
    if (count >= 3) return 'Building momentum';
    return 'Off to a good start';
};

export const getWordsCopy = (count) => {
    if (!count || count === 0) return 'Every word counts';
    if (count >= 5000) return 'A chapter in the making';
    if (count >= 2000) return 'The ink is flowing';
    if (count >= 500) return 'Finding your rhythm';
    return 'First strokes on the canvas';
};

export const getReactionsCopy = (count) => {
    if (!count || count === 0) return 'Your readers are out there';
    if (count >= 50) return 'Resonating deeply';
    if (count >= 20) return 'Striking a chord';
    if (count >= 5) return 'Sparking connection';
    return 'Making an impression';
};

export const getViewsCopy = (count) => {
    if (!count || count === 0) return 'Eyes will follow';
    if (count >= 500) return 'Drawing a crowd';
    if (count >= 100) return 'Turning heads';
    if (count >= 20) return 'Catching attention';
    return 'First glances';
};

const MILESTONES = [7, 14, 30, 50, 100];

const getNextMilestone = (count) => {
    for (const m of MILESTONES) {
        if (count < m) return m;
    }
    return null;
};

export const getOverallEncouragement = (personal, streakCount, freezeAvailable) => {
    const posts = personal?.posts_written || 0;
    const next = getNextMilestone(streakCount);
    const gap = next ? next - streakCount : 0;

    // Milestone proximity (highest priority)
    if (gap === 1 && next) return `One more day and you hit ${next}. Don't stop now.`;
    if (gap === 2 && next) return `Two days from ${next}. You can feel it coming.`;
    if (gap === 3 && next && next >= 30) return `Three days from ${next}. Stay locked in.`;

    // Just hit a milestone
    if (streakCount === 100) return 'Triple digits. You are the streak.';
    if (streakCount === 50) return 'Fifty days. Half a hundred. Relentless.';
    if (streakCount === 30) return 'A full month of writing. That changes a person.';
    if (streakCount === 14) return 'Two weeks straight. This is becoming who you are.';
    if (streakCount === 7) return 'One week down. The habit is forming.';

    // Freeze awareness
    if (freezeAvailable && streakCount >= 7) return `${streakCount} days strong, with a safety net ready.`;

    // General streak tiers
    if (streakCount > 100) return `${streakCount} days. At this point, the streak has a streak.`;
    if (streakCount >= 30) return "Don't break the chain — your consistency is legendary.";
    if (streakCount >= 14) return "Deep in the rhythm now. Your readers can feel it.";
    if (streakCount >= 7) return "Don't break the streak — your consistency is paying off.";
    if (streakCount >= 3) return 'Building momentum. Three days and counting.';
    if (streakCount >= 1) return 'The streak begins. Come back tomorrow to keep it alive.';

    // Fallback: post-count based
    if (posts >= 7) return 'Prolific week — your readers can feel the momentum.';
    if (posts >= 3) return 'Solid pace this week. Keep the words flowing.';
    if (posts === 1) return 'You showed up. That matters more than you think.';
    if (posts === 0) return 'A quiet week, sometimes the best ideas need silence first.';
    return 'Your weekly writing at a glance.';
};
