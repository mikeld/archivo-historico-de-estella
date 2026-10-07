import React, { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Photo, User as AppUser, Role, Curiosity } from "../types";
import { Image as ImageIcon, Heart, UserCircle, LogOut } from "lucide-react";

export function Profile({ user, userRole }: { user: User | null; userRole: Role }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [favorites, setFavorites] = useState<Photo[]>([]);
  const [likedCuriosities, setLikedCuriosities] = useState<(Curiosity & { photo?: Photo })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    async function fetchUserData() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as AppUser;
          setAppUser(data);
          
          if (data.favorites && data.favorites.length > 0) {
            const favPhotos: Photo[] = [];
            for (const id of data.favorites) {
              const pDoc = await getDoc(doc(db, "photos", id));
              if (pDoc.exists()) {
                favPhotos.push({ id: pDoc.id, ...pDoc.data() } as Photo);
              }
            }
            setFavorites(favPhotos);
          }

          if (data.likedCuriosities && data.likedCuriosities.length > 0) {
            const likedCurs: (Curiosity & { photo?: Photo })[] = [];
            for (const id of data.likedCuriosities) {
              const cDoc = await getDoc(doc(db, "curiosities", id));
              if (cDoc.exists()) {
                const cData = { id: cDoc.id, ...cDoc.data() } as Curiosity;
                // Optionally fetch photo for curiosity
                if (cData.photoId) {
                  const pDoc = await getDoc(doc(db, "photos", cData.photoId));
                  if (pDoc.exists()) {
                    (cData as any).photo = { id: pDoc.id, ...pDoc.data() } as Photo;
                  }
                }
                likedCurs.push(cData);
              }
            }
            setLikedCuriosities(likedCurs);
          }
        }
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchUserData();
  }, [user]);

  const removeFavorite = async (photoId: string) => {
    if (!user || !appUser) return;
    const newFavs = (appUser.favorites || []).filter(id => id !== photoId);
    try {
      await updateDoc(doc(db, "users", user.uid), { favorites: newFavs });
      setAppUser({ ...appUser, favorites: newFavs });
      setFavorites(prev => prev.filter(p => p.id !== photoId));
    } catch(e) {
      console.error(e);
    }
  };

  const removeLikedCuriosity = async (curId: string) => {
    if (!user || !appUser) return;
    const newLiked = (appUser.likedCuriosities || []).filter(id => id !== curId);
    try {
      await updateDoc(doc(db, "users", user.uid), { likedCuriosities: newLiked });
      setAppUser({ ...appUser, likedCuriosities: newLiked });
      setLikedCuriosities(prev => prev.filter(c => c.id !== curId));
    } catch(e) {
      console.error(e);
    }
  };

  if (!user) {
    return <div className="text-center py-12">Por favor inicia sesión para ver tu perfil.</div>;
  }

  if (loading) return <div className="text-center py-12">Cargando...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white/80 backdrop-blur-sm shadow-sm rounded-3xl p-8 mb-8 border border-[#e8e8e6] flex flex-col sm:flex-row items-center gap-6">
        <div className="w-24 h-24 bg-[#EAE8E3] rounded-full flex items-center justify-center shrink-0 overflow-hidden text-[#5A5A40]">
           {appUser?.avatarUrl || user.photoURL ? (
             <img src={appUser?.avatarUrl || user.photoURL || ""} alt="Avatar" className="w-full h-full object-cover" />
           ) : (
             <UserCircle className="w-16 h-16" />
           )}
        </div>
        <div>
          <h1 className="text-3xl font-serif text-[#3A3A28] mb-1">{appUser?.displayName || user.displayName || 'Mi Perfil'}</h1>
          <p className="text-[#5A5A40]">{user.email}</p>
          <div className="flex items-center gap-2 mt-3">
             <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-[#5A5A40]/10 text-[#5A5A40]">
               Rol: {userRole}
             </span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>
           <h2 className="text-xl font-serif text-[#3A3A28] mb-6 flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500 fill-red-500" /> Mis Fotos Favoritas
           </h2>
           
           {favorites.length === 0 ? (
             <div className="text-center py-12 bg-white rounded-3xl border border-[#e8e8e6]">
               <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
               <p className="text-gray-500 text-sm">Aún no tienes fotos favoritas.</p>
             </div>
           ) : (
             <div className="space-y-4">
               {favorites.map(photo => (
                 <div key={photo.id} className="relative group bg-white rounded-2xl shadow-sm border border-[#e8e8e6] overflow-hidden flex gap-4 p-3 animate-in fade-in slide-in-from-bottom-2">
                   <div className="w-24 h-24 bg-[#EAE8E3] rounded-xl overflow-hidden shrink-0">
                     <img src={photo.thumbnailUrl || photo.imageUrl} alt="" className="w-full h-full object-cover" />
                   </div>
                   <div className="flex-1 min-w-0 pr-10 flex flex-col justify-center">
                      <p className="text-sm text-gray-900 font-medium line-clamp-2 mb-1">{photo.description || 'Fotografía de Estella'}</p>
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest">{photo.year || 'Sin año'}</span>
                   </div>
                   <button 
                      onClick={() => removeFavorite(photo.id)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-300 hover:text-red-500 transition-colors"
                      title="Quitar de favoritos"
                   >
                      <Heart className="w-5 h-5 fill-current" />
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>

        <div>
           <h2 className="text-xl font-serif text-[#3A3A28] mb-6 flex items-center gap-2">
              <Heart className="w-5 h-5 text-purple-500 fill-purple-500" /> Curiosidades Guardadas
           </h2>
           
           {likedCuriosities.length === 0 ? (
             <div className="text-center py-12 bg-white rounded-3xl border border-[#e8e8e6]">
               <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
               <p className="text-gray-500 text-sm">Aún no has guardado ninguna curiosidad.</p>
             </div>
           ) : (
             <div className="space-y-4">
               {likedCuriosities.map(cur => (
                 <div key={cur.id} className="relative group bg-white rounded-2xl shadow-sm border border-[#e8e8e6] overflow-hidden p-5 animate-in fade-in slide-in-from-bottom-2">
                   <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-[#6A4C93]/10 text-[#6A4C93] rounded text-[10px] font-bold uppercase tracking-wider">
                         {cur.type}
                      </span>
                   </div>
                   <p className="text-sm text-gray-800 leading-relaxed pr-8 line-clamp-3 italic mb-3">"{cur.text}"</p>
                   {cur.photo && (
                     <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <ImageIcon size={10} /> Relacionado con foto de {cur.photo.year || 'Archivo'}
                     </div>
                   )}
                   <button 
                      onClick={() => removeLikedCuriosity(cur.id)}
                      className="absolute right-3 top-5 p-2 text-gray-300 hover:text-red-500 transition-colors"
                      title="Quitar de guardados"
                   >
                      <Heart className="w-5 h-5 fill-current" />
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
