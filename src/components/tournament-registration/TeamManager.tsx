'use client';

import React from 'react';
import { useFieldArray, Control, UseFormRegister, FieldErrors } from 'react-hook-form';
import { TournamentRegistrationFormData } from './schema';
import { PlayerCard } from './PlayerCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Game } from '@/lib/gamesData';

interface TeamManagerProps {
  control: Control<TournamentRegistrationFormData>;
  register: UseFormRegister<TournamentRegistrationFormData>;
  errors: FieldErrors<TournamentRegistrationFormData>;
  game: Game;
}

export const TeamManager: React.FC<TeamManagerProps> = ({
  control,
  register,
  errors,
  game
}) => {
  const isIndividual = game.rules.tournamentType === 'individual';
  const isDuo = game.rules.tournamentType === 'duo';
  
  const requiredPlayerCount = isIndividual ? 0 : game.rules.minTeamSize - 1; // Excluding captain
  const maxPlayerCount = isIndividual ? 0 : game.rules.maxTeamSize - 1; // Excluding captain
  const maxSubstitutes = game.rules.maxSubstitutes || 0;

  const {
    fields: playerFields,
    append: appendPlayer,
    remove: removePlayer
  } = useFieldArray({
    control,
    name: 'players'
  });

  const {
    fields: substituteFields,
    append: appendSubstitute,
    remove: removeSubstitute
  } = useFieldArray({
    control,
    name: 'substitutes'
  });

  const canAddPlayer = playerFields.length < maxPlayerCount;
  const canAddSubstitute = substituteFields.length < maxSubstitutes && maxSubstitutes > 0;
  const hasRequiredPlayers = playerFields.length >= requiredPlayerCount;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 24
      }
    }
  };

  // Don't render for individual games
  if (isIndividual) {
    return null;
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Team Members Section */}
      <motion.section variants={sectionVariants} className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#961c18] to-red-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              Team Members
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <span className={`px-3 py-1 rounded-full font-medium ${
                hasRequiredPlayers 
                  ? 'bg-green-900/50 text-green-300 border border-green-700' 
                  : 'bg-amber-900/50 text-amber-300 border border-amber-700'
              }`}>
                {playerFields.length} / {maxPlayerCount} players
              </span>
              {requiredPlayerCount > 0 && (
                <span className="text-gray-400">
                  (Minimum {requiredPlayerCount} required)
                </span>
              )}
            </div>
          </div>
          
          {canAddPlayer && (
            <motion.button
              type="button"
              onClick={() => appendPlayer({ 
                name: '', 
                studentId: '', 
                university: '', 
                inGameId: '', 
                additionalInfo: '' 
              })}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-gradient-to-r from-[#961c18] to-red-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Player
            </motion.button>
          )}
        </div>

        {/* Player Cards */}
        <AnimatePresence mode="popLayout">
          {playerFields.map((field, index) => (
            <PlayerCard
              key={field.id}
              index={index}
              field={field}
              register={register}
              errors={errors}
              onRemove={() => removePlayer(index)}
              canRemove={playerFields.length > requiredPlayerCount}
              isSubstitute={false}
              gameSpecificFields={game.rules.gameSpecificRules?.additionalFields}
            />
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {playerFields.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 border-2 border-dashed border-gray-600 rounded-2xl bg-gray-800"
          >
            <svg className="w-16 h-16 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No Team Members Yet</h3>
            <p className="text-gray-500 mb-4">
              Add team members to complete your registration
            </p>
            <motion.button
              type="button"
              onClick={() => appendPlayer({ 
                name: '', 
                studentId: '', 
                university: '', 
                inGameId: '', 
                additionalInfo: '' 
              })}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 bg-[#961c18] text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Add First Player
            </motion.button>
          </motion.div>
        )}
      </motion.section>

      {/* Substitutes Section */}
      {maxSubstitutes > 0 && (
        <motion.section variants={sectionVariants} className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Substitutes
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="px-3 py-1 rounded-full font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
                  {substituteFields.length} / {maxSubstitutes} substitutes
                </span>
                <span className="text-gray-400">
                  (Optional backup players)
                </span>
              </div>
            </div>
            
            {canAddSubstitute && (
              <motion.button
                type="button"
                onClick={() => appendSubstitute({ 
                  name: '', 
                  studentId: '', 
                  university: '', 
                  inGameId: '', 
                  additionalInfo: '' 
                })}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Substitute
              </motion.button>
            )}
          </div>

          {/* Substitute Cards */}
          <AnimatePresence mode="popLayout">
            {substituteFields.map((field, index) => (
              <PlayerCard
                key={field.id}
                index={index}
                field={field}
                register={register}
                errors={errors}
                onRemove={() => removeSubstitute(index)}
                canRemove={true}
                isSubstitute={true}
                gameSpecificFields={game.rules.gameSpecificRules?.additionalFields}
              />
            ))}
          </AnimatePresence>

          {/* Empty State for Substitutes */}
          {substituteFields.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 border-2 border-dashed border-amber-700 rounded-2xl bg-amber-900/20"
            >
              <svg className="w-16 h-16 text-amber-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className="text-lg font-semibold text-amber-300 mb-2">No Substitutes Added</h3>
              <p className="text-amber-400/70 mb-4">
                Add backup players for flexibility during the tournament
              </p>
              <motion.button
                type="button"
                onClick={() => appendSubstitute({ 
                  name: '', 
                  studentId: '', 
                  university: '', 
                  inGameId: '', 
                  additionalInfo: '' 
                })}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                Add First Substitute
              </motion.button>
            </motion.div>
          )}
        </motion.section>
      )}

      {/* Schema-level roster errors (minimum/maximum/duplicates) */}
      {(() => {
        const playersError =
          (errors.players as { message?: string; root?: { message?: string } } | undefined);
        const substitutesError =
          (errors.substitutes as { message?: string; root?: { message?: string } } | undefined);
        const message =
          playersError?.message ||
          playersError?.root?.message ||
          substitutesError?.message ||
          substitutesError?.root?.message;
        if (!message) return null;
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-900/30 border-2 border-red-700 rounded-xl p-4 flex items-start gap-3"
          >
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-300 text-sm">{message}</p>
          </motion.div>
        );
      })()}

      {/* Validation Warning */}
      {!hasRequiredPlayers && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-900/30 border-2 border-amber-700 rounded-xl p-4 flex items-start gap-3"
        >
          <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="font-semibold text-amber-300">Minimum Players Required</h4>
            <p className="text-amber-400/80 text-sm mt-1">
              You need at least {requiredPlayerCount} team member{requiredPlayerCount !== 1 ? 's' : ''} to complete registration.
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};