import { supabase } from '../supabase';

export const uploadProfilePicture = async (file) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `profile-pictures/${Math.random()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('profile_picture')
    .upload(fileName, file);

  if (uploadError) {
    console.error("Supabase Storage Upload Error Details:", uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('profile_picture')
    .getPublicUrl(fileName);

  return data.publicUrl;
};
