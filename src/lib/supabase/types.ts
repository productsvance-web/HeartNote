export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          action_notes: string | null
          action_taken: Database["public"]["Enums"]["alert_action"] | null
          ai_reasoning: string | null
          cardiologist_script: string | null
          created_at: string
          daily_log_id: string | null
          id: string
          patient_id: string
          tier: Database["public"]["Enums"]["alert_tier"]
          trigger_data: Json | null
          trigger_reason: string
        }
        Insert: {
          acknowledged_at?: string | null
          action_notes?: string | null
          action_taken?: Database["public"]["Enums"]["alert_action"] | null
          ai_reasoning?: string | null
          cardiologist_script?: string | null
          created_at?: string
          daily_log_id?: string | null
          id?: string
          patient_id: string
          tier: Database["public"]["Enums"]["alert_tier"]
          trigger_data?: Json | null
          trigger_reason: string
        }
        Update: {
          acknowledged_at?: string | null
          action_notes?: string | null
          action_taken?: Database["public"]["Enums"]["alert_action"] | null
          ai_reasoning?: string | null
          cardiologist_script?: string | null
          created_at?: string
          daily_log_id?: string | null
          id?: string
          patient_id?: string
          tier?: Database["public"]["Enums"]["alert_tier"]
          trigger_data?: Json | null
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      cardiology_visits: {
        Row: {
          cardiologist_name: string | null
          created_at: string
          generated_report: Json | null
          generated_report_text: string | null
          id: string
          notes_after: string | null
          patient_id: string
          questions_to_ask: Json | null
          updated_at: string
          visit_date: string
          visit_kind: string | null
        }
        Insert: {
          cardiologist_name?: string | null
          created_at?: string
          generated_report?: Json | null
          generated_report_text?: string | null
          id?: string
          notes_after?: string | null
          patient_id: string
          questions_to_ask?: Json | null
          updated_at?: string
          visit_date: string
          visit_kind?: string | null
        }
        Update: {
          cardiologist_name?: string | null
          created_at?: string
          generated_report?: Json | null
          generated_report_text?: string | null
          id?: string
          notes_after?: string | null
          patient_id?: string
          questions_to_ask?: Json | null
          updated_at?: string
          visit_date?: string
          visit_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cardiology_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          activity_tolerance_change: string | null
          ai_processed_at: string | null
          appetite_change: string | null
          audio_storage_path: string | null
          chest_pain: boolean | null
          chest_pain_character: string | null
          cognition_change: string | null
          cough_nocturnal: boolean | null
          cough_present: boolean | null
          created_at: string
          cyanosis: boolean | null
          diastolic_bp: number | null
          dyspnea_level: number | null
          early_satiety: boolean | null
          extremities_cold_clammy: boolean | null
          fatigue_level: number | null
          feeling_score: number | null
          id: string
          log_date: string
          notes: string | null
          patient_id: string
          pillow_count: number | null
          pnd_episode: boolean | null
          resting_hr: number | null
          spo2: number | null
          sputum_color: string | null
          structured_observations: Json | null
          swelling_severity: number | null
          syncope: boolean | null
          systolic_bp: number | null
          transcribed_text: string | null
          updated_at: string
          urine_output_change: string | null
          weight_lb: number | null
          whisper_confidence: number | null
        }
        Insert: {
          activity_tolerance_change?: string | null
          ai_processed_at?: string | null
          appetite_change?: string | null
          audio_storage_path?: string | null
          chest_pain?: boolean | null
          chest_pain_character?: string | null
          cognition_change?: string | null
          cough_nocturnal?: boolean | null
          cough_present?: boolean | null
          created_at?: string
          cyanosis?: boolean | null
          diastolic_bp?: number | null
          dyspnea_level?: number | null
          early_satiety?: boolean | null
          extremities_cold_clammy?: boolean | null
          fatigue_level?: number | null
          feeling_score?: number | null
          id?: string
          log_date: string
          notes?: string | null
          patient_id: string
          pillow_count?: number | null
          pnd_episode?: boolean | null
          resting_hr?: number | null
          spo2?: number | null
          sputum_color?: string | null
          structured_observations?: Json | null
          swelling_severity?: number | null
          syncope?: boolean | null
          systolic_bp?: number | null
          transcribed_text?: string | null
          updated_at?: string
          urine_output_change?: string | null
          weight_lb?: number | null
          whisper_confidence?: number | null
        }
        Update: {
          activity_tolerance_change?: string | null
          ai_processed_at?: string | null
          appetite_change?: string | null
          audio_storage_path?: string | null
          chest_pain?: boolean | null
          chest_pain_character?: string | null
          cognition_change?: string | null
          cough_nocturnal?: boolean | null
          cough_present?: boolean | null
          created_at?: string
          cyanosis?: boolean | null
          diastolic_bp?: number | null
          dyspnea_level?: number | null
          early_satiety?: boolean | null
          extremities_cold_clammy?: boolean | null
          fatigue_level?: number | null
          feeling_score?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          patient_id?: string
          pillow_count?: number | null
          pnd_episode?: boolean | null
          resting_hr?: number | null
          spo2?: number | null
          sputum_color?: string | null
          structured_observations?: Json | null
          swelling_severity?: number | null
          syncope?: boolean | null
          systolic_bp?: number | null
          transcribed_text?: string | null
          updated_at?: string
          urine_output_change?: string | null
          weight_lb?: number | null
          whisper_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          patient_id: string
          recipient_email: string | null
          recipient_label: string | null
          revoked_at: string | null
          share_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          patient_id: string
          recipient_email?: string | null
          recipient_label?: string | null
          revoked_at?: string | null
          share_token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          patient_id?: string
          recipient_email?: string | null
          recipient_label?: string | null
          revoked_at?: string | null
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shares_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_events: {
        Row: {
          actual_taken_at: string | null
          created_at: string
          id: string
          medication_id: string
          notes: string | null
          patient_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["med_event_status"]
        }
        Insert: {
          actual_taken_at?: string | null
          created_at?: string
          id?: string
          medication_id: string
          notes?: string | null
          patient_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["med_event_status"]
        }
        Update: {
          actual_taken_at?: string | null
          created_at?: string
          id?: string
          medication_id?: string
          notes?: string | null
          patient_id?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["med_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "medication_events_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          dose: string | null
          drug_class: Database["public"]["Enums"]["med_class"]
          drug_name: string
          frequency: string | null
          id: string
          notes: string | null
          patient_id: string
          started_at: string | null
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dose?: string | null
          drug_class?: Database["public"]["Enums"]["med_class"]
          drug_name: string
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          started_at?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dose?: string | null
          drug_class?: Database["public"]["Enums"]["med_class"]
          drug_name?: string
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          started_at?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          baseline_dbp_high: number | null
          baseline_dbp_low: number | null
          baseline_resting_hr_high: number | null
          baseline_resting_hr_low: number | null
          baseline_sbp_high: number | null
          baseline_sbp_low: number | null
          cardiologist_name: string | null
          cardiologist_phone: string | null
          caregiver_id: string
          created_at: string
          date_of_birth: string | null
          display_name: string
          dry_weight_lb: number | null
          hf_hospitalization_count: number
          id: string
          known_allergies: string[] | null
          last_hf_hospitalization_date: string | null
          normal_active_minutes_per_day: number | null
          normal_pillow_count: number | null
          notes: string | null
          nyha_class: Database["public"]["Enums"]["nyha_class"] | null
          primary_conditions: string[] | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          baseline_dbp_high?: number | null
          baseline_dbp_low?: number | null
          baseline_resting_hr_high?: number | null
          baseline_resting_hr_low?: number | null
          baseline_sbp_high?: number | null
          baseline_sbp_low?: number | null
          cardiologist_name?: string | null
          cardiologist_phone?: string | null
          caregiver_id: string
          created_at?: string
          date_of_birth?: string | null
          display_name: string
          dry_weight_lb?: number | null
          hf_hospitalization_count?: number
          id?: string
          known_allergies?: string[] | null
          last_hf_hospitalization_date?: string | null
          normal_active_minutes_per_day?: number | null
          normal_pillow_count?: number | null
          notes?: string | null
          nyha_class?: Database["public"]["Enums"]["nyha_class"] | null
          primary_conditions?: string[] | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          baseline_dbp_high?: number | null
          baseline_dbp_low?: number | null
          baseline_resting_hr_high?: number | null
          baseline_resting_hr_low?: number | null
          baseline_sbp_high?: number | null
          baseline_sbp_low?: number | null
          cardiologist_name?: string | null
          cardiologist_phone?: string | null
          caregiver_id?: string
          created_at?: string
          date_of_birth?: string | null
          display_name?: string
          dry_weight_lb?: number | null
          hf_hospitalization_count?: number
          id?: string
          known_allergies?: string[] | null
          last_hf_hospitalization_date?: string | null
          normal_active_minutes_per_day?: number | null
          normal_pillow_count?: number | null
          notes?: string | null
          nyha_class?: Database["public"]["Enums"]["nyha_class"] | null
          primary_conditions?: string[] | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_caregiver_id_fkey"
            columns: ["caregiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      significant_events: {
        Row: {
          created_at: string
          description: string | null
          event_date: string
          event_time: string | null
          event_type: Database["public"]["Enums"]["significant_event_type"]
          id: string
          location: string | null
          patient_id: string
          related_alert_id: string | null
          related_log_id: string | null
          resolved: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_date: string
          event_time?: string | null
          event_type: Database["public"]["Enums"]["significant_event_type"]
          id?: string
          location?: string | null
          patient_id: string
          related_alert_id?: string | null
          related_log_id?: string | null
          resolved?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: Database["public"]["Enums"]["significant_event_type"]
          id?: string
          location?: string | null
          patient_id?: string
          related_alert_id?: string | null
          related_log_id?: string | null
          resolved?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "significant_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "significant_events_related_alert_id_fkey"
            columns: ["related_alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "significant_events_related_log_id_fkey"
            columns: ["related_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alert_action:
        | "called_doctor"
        | "went_to_er"
        | "scheduled_appt"
        | "ignored"
        | "false_alarm"
      alert_tier: "tier_1_911" | "tier_2_today" | "tier_3_48hr" | "tier_4_log"
      med_class:
        | "loop_diuretic"
        | "ace_inhibitor"
        | "arb"
        | "arni"
        | "beta_blocker"
        | "mra"
        | "sglt2_inhibitor"
        | "digoxin"
        | "antiarrhythmic"
        | "anticoagulant_warfarin"
        | "anticoagulant_doac"
        | "potassium_supplement"
        | "other"
      med_event_status:
        | "taken"
        | "missed"
        | "double_dosed"
        | "refused"
        | "early"
        | "late"
      nyha_class: "I" | "II" | "III" | "IV" | "unknown"
      significant_event_type:
        | "fall"
        | "er_visit"
        | "hospitalization"
        | "chest_pain_episode"
        | "near_syncope"
        | "syncope"
        | "new_med_started"
        | "med_stopped"
        | "new_diagnosis"
        | "cardiology_visit_unplanned"
        | "home_visit_clinician"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_action: [
        "called_doctor",
        "went_to_er",
        "scheduled_appt",
        "ignored",
        "false_alarm",
      ],
      alert_tier: ["tier_1_911", "tier_2_today", "tier_3_48hr", "tier_4_log"],
      med_class: [
        "loop_diuretic",
        "ace_inhibitor",
        "arb",
        "arni",
        "beta_blocker",
        "mra",
        "sglt2_inhibitor",
        "digoxin",
        "antiarrhythmic",
        "anticoagulant_warfarin",
        "anticoagulant_doac",
        "potassium_supplement",
        "other",
      ],
      med_event_status: [
        "taken",
        "missed",
        "double_dosed",
        "refused",
        "early",
        "late",
      ],
      nyha_class: ["I", "II", "III", "IV", "unknown"],
      significant_event_type: [
        "fall",
        "er_visit",
        "hospitalization",
        "chest_pain_episode",
        "near_syncope",
        "syncope",
        "new_med_started",
        "med_stopped",
        "new_diagnosis",
        "cardiology_visit_unplanned",
        "home_visit_clinician",
        "other",
      ],
    },
  },
} as const
