'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TournamentRegistrationFormData, 
  createTournamentRegistrationSchema, 
  PlayerInfo 
} from './schema';
import { Game, gamesData } from '@/lib/gamesData';
import { StepsIndicator } from './StepsIndicator';
import { TeamManager } from './TeamManager';

// CMS Tournament interface matching what the API returns
export interface CMSTournament {
  id: string;
  gameName: string;
  title?: string;
  description?: string;
  tournamentStatus?: 'upcoming' | 'registration_open' | 'registration_closed' | 'ongoing' | 'completed';
  registrationDeadline?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  category?: string;
  slug?: string;
  image?: string;
  enableTickets?: boolean;
  hasTickets?: boolean;
  ticketStartingPrice?: number;
  ticketCurrency?: string;
  ticketTaxRate?: number;
}

interface TournamentRegistrationFormProps {
  initialData?: Partial<TournamentRegistrationFormData>;
  onSubmit?: (data: TournamentRegistrationFormData) => void;
  selectedGameSlug?: string;
  tournaments?: CMSTournament[]; // CMS tournaments from API
  onTournamentChange?: (tournament: CMSTournament) => void;
  /** Pre-select a tournament (e.g. from ?tournament=<id>). */
  initialTournamentId?: string | null;
  /** The captain's student ID, used to reject duplicate roster entries. */
  captainStudentId?: string;
}

interface FormStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<{
    control: any;
    register: any;
    errors: any;
    watch: any;
    setValue: any;
    game: Game;
  }>;
  isSkippable?: boolean;
  shouldShow?: (game: Game, formData: any) => boolean;
}

export const TournamentRegistrationForm: React.FC<TournamentRegistrationFormProps> = ({
  initialData = {},
  onSubmit,
  selectedGameSlug,
  tournaments = [], // CMS tournaments from API
  onTournamentChange,
  initialTournamentId,
  captainStudentId,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedGame, setSelectedGame] = useState<Game | null>(
    selectedGameSlug ? gamesData[selectedGameSlug] || null : null
  );
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The resolver is created once by useForm, so it must read the current game
  // and captain ID through refs instead of capturing their initial values.
  const selectedGameRef = useRef<Game | null>(selectedGame);
  selectedGameRef.current = selectedGame;
  const captainStudentIdRef = useRef<string | undefined>(captainStudentId);
  captainStudentIdRef.current = captainStudentId;

  // Initialize form with validation
  const methods = useForm<TournamentRegistrationFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: ((values: TournamentRegistrationFormData, context: any, options: any) => {
      const game = selectedGameRef.current;
      if (!game) {
        return {
          values: {},
          errors: {
            tournamentId: {
              type: 'required',
              message: 'Tournament selection is required',
            },
          },
        } as any;
      }
      const schema = createTournamentRegistrationSchema(game, {
        captainStudentId: captainStudentIdRef.current,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (zodResolver(schema) as any)(values, context, options);
    }) as any,
    defaultValues: {
      tournamentId: '',
      teamName: '',
      additionalInfo: '',
      players: [],
      substitutes: [],
      gameSpecificFields: {},
      ...initialData
    }
  });

  const { control, register, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors } } = methods;

  // Handler for tournament selection - finds the game from gamesData based on tournament's gameName
  const handleTournamentSelect = (tournament: CMSTournament) => {
    // Find the game in gamesData that matches this tournament's gameName
    const gameSlug = Object.keys(gamesData).find(slug => {
      const game = gamesData[slug];
      return game.name.toLowerCase() === tournament.gameName.toLowerCase() ||
             game.slug === tournament.slug ||
             game.slug === tournament.gameName.toLowerCase().replace(/\s+/g, '-');
    });
    
    const game = gameSlug ? gamesData[gameSlug] : null;
    setSelectedGame(game);
    setSelectedTournamentId(tournament.id);
    setValue('tournamentId', tournament.id);
    onTournamentChange?.(tournament);
    
    // Reset form fields when changing tournament
    setValue('players', []);
    setValue('substitutes', []);
    setValue('teamName', '');
    setValue('gameSpecificFields', {});
    setSubmitError(null);
  };

  // Pre-select a tournament passed via the URL, once the list is available.
  useEffect(() => {
    if (!initialTournamentId || selectedTournamentId) return;
    const tournament =
      tournaments.find((entry) => entry.id === initialTournamentId) ||
      tournaments.find((entry) => entry.slug === initialTournamentId);
    if (tournament) {
      handleTournamentSelect(tournament);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTournamentId, tournaments, selectedTournamentId]);

  // Helper function to check if game is individual
  const isGameIndividual = (game: Game): boolean => {
    return game.rules.tournamentType === 'individual';
  };

  // Define form steps
  const formSteps: FormStep[] = [
    {
      id: 'tournament',
      title: 'Tournament',
      description: 'Select your tournament',
      component: ({ register, errors, watch, setValue, game }) => (
        <TournamentSelectionStep
          register={register}
          errors={errors}
          watch={watch}
          setValue={setValue}
          onGameSelect={setSelectedGame}
          selectedGame={selectedGame}
          tournaments={tournaments}
          onTournamentSelect={handleTournamentSelect}
          selectedTournamentId={selectedTournamentId}
        />
      )
    },
    {
      id: 'player-info',
      title: 'Your Info',
      description: 'Player details',
      component: ({ register, errors, watch, setValue, game }) => (
        <TeamInfoStep
          register={register}
          errors={errors}
          watch={watch}
          setValue={setValue}
          game={game}
        />
      )
    },
    {
      id: 'players',
      title: 'Players',
      description: 'Team members',
      component: ({ control, register, errors, game }) => (
        <TeamManager
          control={control}
          register={register}
          errors={errors}
          game={game}
        />
      ),
      shouldShow: (game) => !isGameIndividual(game)
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Review submission',
      component: ({ watch, game }) => (
        <ReviewStep
          formData={watch()}
          game={game}
        />
      )
    }
  ];

  // Filter steps based on game type
  const visibleSteps = selectedGame 
    ? formSteps.filter(step => !step.shouldShow || step.shouldShow(selectedGame, {}))
    : [formSteps[0]]; // Only show tournament selection if no game selected

  // Navigation functions
  const nextStep = async () => {
    if (currentStep < visibleSteps.length - 1) {
      const isStepValid = await validateCurrentStep();
      if (isStepValid) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepIndex: number) => {
    if (stepIndex < currentStep || stepIndex === currentStep + 1) {
      setCurrentStep(stepIndex);
    }
  };

  // Validate current step
  const validateCurrentStep = async (): Promise<boolean> => {
    const currentStepData = visibleSteps[currentStep];
    if (!currentStepData) return false;

    const stepFields: Record<string, string[]> = {
      tournament: ['tournamentId'],
      'player-info': ['teamName', 'gameSpecificFields'],
      players: ['players', 'substitutes'],
    };
    const roots = stepFields[currentStepData.id] ?? [];

    // Clear stale field errors for the current step before re-validating.
    roots.forEach((root) => clearErrors(root as never));

    if (!selectedGame) {
      setSubmitError('Select a tournament to continue.');
      return false;
    }

    const schema = createTournamentRegistrationSchema(selectedGame, {
      captainStudentId,
    });
    const result = schema.safeParse(methods.getValues());
    if (result.success) {
      setSubmitError(null);
      return true;
    }

    let firstMessage: string | null = null;
    for (const issue of result.error.issues) {
      const root = String(issue.path[0] ?? '');
      if (!roots.includes(root)) continue;
      if (!firstMessage) firstMessage = issue.message;
      const name = issue.path.length > 0 ? issue.path.join('.') : root;
      setError(name as never, { type: 'manual', message: issue.message });
    }

    if (firstMessage) {
      setSubmitError(firstMessage);
      return false;
    }

    setSubmitError(null);
    return true;
  };

  // Handle form submission
  const onFormSubmit = (data: TournamentRegistrationFormData) => {
    setSubmitError(null);
    onSubmit?.(data);
  };

  const onInvalidSubmit = (formErrors: Record<string, unknown>) => {
    setSubmitError('Please fix the highlighted fields before submitting.');
    const keys = Object.keys(formErrors);
    const targetStepId = keys.some(
      (key) => key === 'players' || key === 'substitutes' || key.startsWith('players.') || key.startsWith('substitutes.')
    )
      ? 'players'
      : keys.some(
          (key) =>
            key === 'teamName' ||
            key === 'gameSpecificFields' ||
            key.startsWith('gameSpecificFields.')
        )
        ? 'player-info'
        : 'tournament';
    const targetIndex = visibleSteps.findIndex((step) => step.id === targetStepId);
    if (targetIndex >= 0) setCurrentStep(targetIndex);
  };

  const submitRegistration = handleSubmit(onFormSubmit, onInvalidSubmit);

  // Container animations
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1] as const
      }
    }
  };

  const stepVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1] as const
      }
    },
    exit: {
      opacity: 0,
      x: -50,
      transition: {
        duration: 0.2
      }
    }
  };

  const CurrentStepComponent = visibleSteps[currentStep]?.component;

  return (
    <FormProvider {...methods}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-4xl mx-auto bg-black rounded-none shadow-2xl overflow-hidden border border-gray-800"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#961c18] via-[#7a0f0b] to-black p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Tournament Registration</h1>
          <p className="text-gray-300">
            Join the competition and showcase your skills
          </p>
        </div>

        {/* Steps Indicator */}
        <div className="px-8 pt-8">
          <StepsIndicator
            steps={visibleSteps.map((step, index) => ({
              id: step.id,
              title: step.title,
              description: step.description,
              status: index < currentStep ? 'completed' : index === currentStep ? 'current' : 'pending'
            }))}
            currentStep={currentStep}
            onStepClick={goToStep}
          />
        </div>

        {/* Form Content */}
        <div className="px-8 py-6 bg-black">
          <AnimatePresence mode="wait">
            {CurrentStepComponent && (
              <motion.div
                key={currentStep}
                variants={stepVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <CurrentStepComponent
                  control={control}
                  register={register}
                  errors={errors}
                  watch={watch}
                  setValue={setValue}
                  game={selectedGame!}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="px-8 py-6 bg-black border-t border-gray-700">
          {submitError && (
            <div className="mb-4 rounded-xl border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
              {submitError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <motion.button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 0}
              whileHover={{ scale: currentStep > 0 ? 1.05 : 1 }}
              whileTap={{ scale: currentStep > 0 ? 0.95 : 1 }}
              className={`
                px-6 py-3 font-semibold rounded-xl transition-all duration-300
                ${currentStep > 0 
                  ? 'bg-gray-700 text-white hover:bg-gray-600' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </div>
            </motion.button>

            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Step {currentStep + 1}</span>
              <span>of</span>
              <span>{visibleSteps.length}</span>
            </div>

            {visibleSteps[currentStep].id === 'review' ? (
              <motion.button
                type="button"
                onClick={submitRegistration}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-3 font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r from-[#961c18] to-red-600 text-white hover:from-red-700 hover:to-red-800 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Submit Registration
                </div>
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={nextStep}
                disabled={!selectedGame}
                whileHover={{ scale: selectedGame ? 1.05 : 1 }}
                whileTap={{ scale: selectedGame ? 0.95 : 1 }}
                className={`
                  px-6 py-3 font-semibold rounded-xl transition-all duration-300 flex items-center gap-2
                  ${selectedGame 
                    ? 'bg-gradient-to-r from-[#961c18] to-red-600 text-white hover:from-red-700 hover:to-red-800 shadow-lg' 
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                Next
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </FormProvider>
  );
};

// Tournament Selection Step Component
const TournamentSelectionStep: React.FC<{
  register: any;
  errors: any;
  watch: any;
  setValue: any;
  onGameSelect: (game: Game | null) => void;
  selectedGame: Game | null;
  tournaments?: CMSTournament[];
  onTournamentSelect?: (tournament: CMSTournament) => void;
  selectedTournamentId?: string | null;
}> = ({ register, errors, watch, setValue, onGameSelect, selectedGame, tournaments = [], onTournamentSelect, selectedTournamentId }) => {
  
  // If CMS tournaments are available, display them; otherwise fall back to gamesData
  const hasCMSTournaments = tournaments.length > 0;

  // Fallback: use gamesData if no CMS tournaments
  const handleGameSelect = (gameSlug: string) => {
    const game = gamesData[gameSlug];
    onGameSelect(game);
    setValue('tournamentId', gameSlug);
    
    // Reset form fields that might be invalid for the new game
    setValue('players', []);
    setValue('substitutes', []);
    setValue('teamName', '');
  };

  // Find game info for a CMS tournament
  const getGameForTournament = (tournament: CMSTournament): Game | null => {
    const gameSlug = Object.keys(gamesData).find(slug => {
      const game = gamesData[slug];
      return game.name.toLowerCase() === tournament.gameName.toLowerCase() ||
             game.slug === tournament.slug ||
             game.slug === tournament.gameName.toLowerCase().replace(/\s+/g, '-');
    });
    return gameSlug ? gamesData[gameSlug] : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {hasCMSTournaments ? 'Select Tournament' : 'Select Game'}
        </h2>
        <p className="text-gray-400">
          {hasCMSTournaments 
            ? 'Choose the tournament you want to participate in' 
            : 'Choose the game you want to register for'}
        </p>
      </div>

      {/* CMS Tournaments from API */}
      {hasCMSTournaments ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tournaments.map((tournament) => {
            const game = getGameForTournament(tournament);
            const isSelected = selectedTournamentId === tournament.id;
            
            return (
              <motion.button
                key={tournament.id}
                type="button"
                onClick={() => onTournamentSelect?.(tournament)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  relative p-6 rounded-2xl border-2 transition-all duration-300 text-left
                  ${isSelected
                    ? 'border-[#961c18] bg-[#961c18]/20 shadow-lg'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:shadow-md'
                  }
                `}
              >
                {/* Tournament Status Badge */}
                <div className="absolute top-3 right-3">
                  <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                    tournament.tournamentStatus === 'registration_open' 
                      ? 'bg-green-500 text-white'
                      : tournament.tournamentStatus === 'upcoming'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-500 text-white'
                  }`}>
                    {tournament.tournamentStatus?.replace('_', ' ').toUpperCase() || 'AVAILABLE'}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={tournament.image || game?.image || '/images/default-tournament.png'}
                    alt={tournament.title || tournament.gameName}
                    className="w-16 h-16 rounded-xl object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://via.placeholder.com/64x64?text=${encodeURIComponent(tournament.gameName)}`;
                    }}
                  />
                  <div>
                    <h3 className="font-bold text-white">{tournament.title || tournament.gameName}</h3>
                    <p className="text-sm text-gray-400">{tournament.gameName}</p>
                  </div>
                </div>

                {tournament.enableTickets && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/50 text-xs font-bold rounded-full">
                      🎟️ Ticket required
                    </span>
                    {typeof tournament.ticketStartingPrice === 'number' && (
                      <span className="text-xs font-semibold text-amber-200">
                        from {tournament.ticketCurrency || 'KES'}{' '}
                        {tournament.ticketStartingPrice.toLocaleString()}
                        {tournament.ticketTaxRate ? ` + ${tournament.ticketTaxRate}% tax` : ''}
                      </span>
                    )}
                  </div>
                )}
                
                <div className="space-y-2 text-sm">
                  {game && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Type:</span>
                        <span className="font-medium text-white capitalize">
                          {game.rules.tournamentType}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Team Size:</span>
                        <span className="font-medium text-white">
                          {game.rules.minTeamSize}{game.rules.maxTeamSize !== game.rules.minTeamSize && `-${game.rules.maxTeamSize}`}
                          {game.rules.allowSubstitutes && ` (+${game.rules.maxSubstitutes || 0} subs)`}
                        </span>
                      </div>
                    </>
                  )}
                  {tournament.registrationDeadline && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Deadline:</span>
                      <span className="font-medium text-white">
                        {new Date(tournament.registrationDeadline).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute bottom-3 right-3">
                    <svg className="w-6 h-6 text-[#961c18]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      ) : (
        /* Fallback: Show games from gamesData */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.values(gamesData).map((game) => (
            <motion.button
              key={game.slug}
              type="button"
              onClick={() => handleGameSelect(game.slug)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={`
                relative p-6 rounded-2xl border-2 transition-all duration-300 text-left
                ${watch('tournamentId') === game.slug
                  ? 'border-[#961c18] bg-[#961c18]/20 shadow-lg'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:shadow-md'
                }
              `}
            >
              {game.featured && (
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-1 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs font-bold rounded-full">
                    Featured
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-4 mb-4">
                <img
                  src={game.image}
                  alt={game.name}
                  className="w-16 h-16 rounded-xl object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://via.placeholder.com/64x64?text=${encodeURIComponent(game.name)}`;
                  }}
                />
                <div>
                  <h3 className="font-bold text-white">{game.name}</h3>
                  <p className="text-sm text-gray-400">{game.category}</p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="font-medium text-white capitalize">
                    {game.rules.tournamentType}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Team Size:</span>
                  <span className="font-medium text-white">
                    {game.rules.minTeamSize}{game.rules.maxTeamSize !== game.rules.minTeamSize && `-${game.rules.maxTeamSize}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Platform:</span>
                  <span className="font-medium text-white">{game.platform}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {errors.tournamentId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-900/50 border border-red-700 rounded-xl p-4 text-red-300"
        >
          Please select a tournament to continue
        </motion.div>
      )}
    </div>
  );
};

// Team Info Step Component
const TeamInfoStep: React.FC<{
  register: any;
  errors: any;
  watch: any;
  setValue: any;
  game: Game;
}> = ({ register, errors, watch, setValue, game }) => {
  const isIndividual = game.rules.tournamentType === 'individual';
  const isDuo = game.rules.tournamentType === 'duo';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isIndividual ? 'Player Information' : 'Team Information'}
        </h2>
        <p className="text-gray-400">
          {isIndividual 
            ? "Tell us about yourself" 
            : isDuo 
              ? "Tell us about your duo"
              : "Tell us about your team"
          }
        </p>
      </div>

      {/* Team Name for non-individual tournaments */}
      {!isIndividual && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-300">
            {isDuo ? 'Duo Name' : 'Team Name'} *
          </label>
          <input
            {...register('teamName', { required: isDuo ? 'Duo name is required' : 'Team name is required' })}
            type="text"
            placeholder={`Enter your ${isDuo ? 'duo' : 'team'} name`}
            className={`
              w-full px-4 py-3 rounded-xl border-2 border-gray-700 
              focus:outline-none focus:ring-2 focus:ring-[#961c18]/50 
              transition-all duration-200 font-medium bg-gray-800 text-white
              ${errors.teamName ? 'border-red-500 bg-red-900/20' : ''}
            `}
          />
          {errors.teamName && (
            <p className="text-sm text-red-600 font-medium">
              {errors.teamName.message as string}
            </p>
          )}
        </div>
      )}

      {/* Game-Specific Fields */}
      {game.rules.gameSpecificRules?.additionalFields && game.rules.gameSpecificRules.additionalFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Game-Specific Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {game.rules.gameSpecificRules.additionalFields.map((field) => {
              const fieldError = errors.gameSpecificFields?.[field.name];
              return (
                <div key={field.name} className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300">
                    {field.label} {field.required && '*'}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      {...register(`gameSpecificFields.${field.name}`)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#961c18]/50 transition-all duration-200 font-medium bg-gray-800 text-white"
                    >
                      <option value="">Select {field.label}</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...register(`gameSpecificFields.${field.name}`)}
                      type={field.type}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#961c18]/50 transition-all duration-200 font-medium bg-gray-800 text-white placeholder-gray-500"
                    />
                  )}
                  {fieldError && (
                    <p className="text-sm text-red-500 font-medium">
                      {fieldError.message as string}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Additional Information */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-300">
          Additional Information
        </label>
        <textarea
          {...register('additionalInfo')}
          rows={4}
          placeholder="Any additional notes, special requirements, or questions..."
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-700 focus:outline-none focus:ring-2 focus:ring-[#961c18]/50 transition-all duration-200 font-medium resize-none bg-gray-800 text-white placeholder-gray-500"
        />
      </div>
    </div>
  );
};

// Review Step Component
const ReviewStep: React.FC<{
  formData: TournamentRegistrationFormData;
  game: Game;
}> = ({ formData, game }) => {
  const isIndividual = game.rules.tournamentType === 'individual';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Review Your Registration</h2>
        <p className="text-gray-400">Please review all information before submitting</p>
      </div>

      <div className="bg-gray-800 rounded-2xl p-6 space-y-6">
        {/* Tournament Info */}
        <div>
          <h3 className="font-semibold text-white mb-2">Tournament Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Game:</span>
              <p className="font-medium text-white">{game.name}</p>
            </div>
            <div>
              <span className="text-gray-400">Type:</span>
              <p className="font-medium text-white capitalize">{game.rules.tournamentType}</p>
            </div>
          </div>
        </div>

        {/* Team Info */}
        {!isIndividual && formData.teamName && (
          <div>
            <h3 className="font-semibold text-white mb-2">Team Information</h3>
            <p className="text-sm text-gray-300">{formData.teamName}</p>
          </div>
        )}

        {/* Players Summary */}
        {!isIndividual && (
          <div>
            <h3 className="font-semibold text-white mb-2">Team Members</h3>
            <div className="text-sm text-gray-300 space-y-1">
              <p className="text-gray-400">
                Players: {formData.players?.length || 0} &middot; Substitutes:{' '}
                {formData.substitutes?.length || 0}
              </p>
              {formData.players?.map((player, index) => (
                <p key={`player-${index}`}>
                  {player.name} &middot; {player.studentId} &middot; {player.university}
                </p>
              ))}
              {formData.substitutes?.map((player, index) => (
                <p key={`sub-${index}`} className="text-gray-400">
                  Sub: {player.name} &middot; {player.studentId}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Game-specific information */}
        {formData.gameSpecificFields &&
          Object.entries(formData.gameSpecificFields).filter(
            ([, value]) => value !== undefined && value !== null && String(value).trim() !== ''
          ).length > 0 && (
            <div>
              <h3 className="font-semibold text-white mb-2">In-Game Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300">
                {Object.entries(formData.gameSpecificFields)
                  .filter(
                    ([, value]) =>
                      value !== undefined && value !== null && String(value).trim() !== ''
                  )
                  .map(([key, value]) => (
                    <p key={key}>
                      <span className="text-gray-400 capitalize">
                        {key.replace(/_/g, ' ')}:
                      </span>{' '}
                      {String(value)}
                    </p>
                  ))}
              </div>
            </div>
          )}

        {/* Additional Info */}
        {formData.additionalInfo && (
          <div>
            <h3 className="font-semibold text-white mb-2">Additional Information</h3>
            <p className="text-sm text-gray-300">{formData.additionalInfo}</p>
          </div>
        )}
      </div>

      <div className="bg-[#961c18]/20 border border-[#961c18] rounded-xl p-4">
        <p className="text-sm text-gray-300">
          <strong className="text-white">Note:</strong> By submitting this registration, you confirm that all provided information is accurate and you agree to the tournament rules and regulations.
        </p>
      </div>
    </div>
  );
};