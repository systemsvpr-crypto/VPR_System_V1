import { supabase } from '../supabase';

export const uploadProfilePicture = async (file) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `profile-pictures/${Math.random()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(fileName);

  return data.publicUrl;
};
