import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Suggestion, Photo, Role, User as AppUser, Curiosity } from "../types";
import {
  Check,
  X,
  Clock,
  Edit3,
  UserPlus,
  ShieldAlert,
  Users,
  Image as ImageIcon,
  Wand2,
  RefreshCw,
} from "lucide-react";
import { User } from "firebase/auth";

export function AdminDashboard({
  user,
  userRole,
}: {
  user: User | null;
  userRole: Role;
}) {
  const [activeTab, setActiveTab] = useState<"suggestions" | "users">(
    "suggestions",
  );
  const [suggestions, setSuggestions] = useState<
    (Suggestion & { photo?: Photo })[]
  >([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin =
    user?.email === "mikeldiaz0@gmail.com" ||
    user?.email === "estellaescapecity@gmail.com" ||
    userRole === "admin";
  const isEditor = userRole === "editor" || isAdmin;

  useEffect(() => {
    if (!isEditor) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        const q = query(
          collection(db, "suggestions"),
          where("status", "==", "pending"),
        );
        const snapshot = await getDocs(q);
        const loaded: (Suggestion & { photo?: Photo })[] = [];
        for (const docSnap of snapshot.docs) {
          const suggestion = {
            id: docSnap.id,
            ...docSnap.data(),
          } as Suggestion;
          const photoSnap = await getDoc(doc(db, "photos", suggestion.photoId));
          if (photoSnap.exists()) {
            loaded.push({
              ...suggestion,
              photo: { id: photoSnap.id, ...photoSnap.data() } as Photo,
            });
          } else {
            loaded.push(suggestion);
          }
        }
        loaded.sort((a, b) => b.createdAt - a.createdAt);
        setSuggestions(loaded);

        if (isAdmin) {
          const uSnap = await getDocs(query(collection(db, "users")));
          const mUsers: AppUser[] = [];
          uSnap.forEach((d) => mUsers.push(d.data() as AppUser));
          setUsers(mUsers);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "admin");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isEditor, isAdmin, user]);

  const handleAction = async (
    suggestion: Suggestion & { photo?: Photo },
    action: "approved" | "rejected",
  ) => {
    try {
      setActionLoading(suggestion.id);
      if (action === "approved" && suggestion.photo) {
        const updates: any = {};
        if (suggestion.type === "edit_details" && suggestion.proposedChanges) {
          if (suggestion.proposedChanges.description)
            updates.description = suggestion.proposedChanges.description;
          if (suggestion.proposedChanges.year)
            updates.year = suggestion.proposedChanges.year;
        } else if (
          suggestion.type === "claim_authorship" &&
          suggestion.proposedChanges
        ) {
          if (suggestion.proposedChanges.owner)
            updates.owner = suggestion.proposedChanges.owner;
        } else if (
          (suggestion.type === "add_curiosity" ||
            suggestion.type === "add_anecdote") &&
          suggestion.proposedChanges
        ) {
          const authorSnap = await getDoc(
            doc(db, "users", suggestion.suggestedBy),
          );
          const authorName = authorSnap.exists()
            ? authorSnap.data().displayName || authorSnap.data().email
            : "Usuario";

          const newCuriosity = {
            photoId: suggestion.photoId,
            text: suggestion.proposedChanges.curiosityText || "",
            type: suggestion.proposedChanges.curiosityType || "curiosity",
            addedBy: suggestion.suggestedBy,
            authorName,
            createdAt: Date.now(),
            likes: 0
          };
          await setDoc(doc(db, "curiosities", crypto.randomUUID()), newCuriosity);
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "photos", suggestion.photoId), updates);
        }
      }
      await updateDoc(doc(db, "suggestions", suggestion.id), {
        status: action,
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (err) {
      console.error(err);
      alert("Error procesando acción");
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: Role) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
        isAdmin: newRole === "admin",
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, role: newRole, isAdmin: newRole === "admin" }
            : u,
        ),
      );
    } catch (e) {
      console.error(e);
      alert("Error cambiando rol.");
    }
  };

  if (!isEditor) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl flex flex-col items-center justify-center text-center max-w-md mx-auto mt-12">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-red-900 mb-2">Acceso Denegado</h2>
        <p className="text-red-700">No tienes permisos para ver el panel.</p>
      </div>
    );
  }

  if (loading)
    return <div className="text-center py-12">Cargando datos...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-serif tracking-tight text-[#3A3A28] mb-2">
            Panel de Control
          </h1>
          <p className="text-[#5A5A40]">
            Gestiona aportaciones de usuarios y roles.
          </p>
        </div>
      </div>

      <div className="flex bg-[#EAE8E3] rounded-full p-1.5 mb-8 w-full md:w-auto overflow-x-auto">
        <button
          onClick={() => setActiveTab("suggestions")}
          className={`flex-1 min-w-[120px] text-sm font-medium py-2.5 px-6 rounded-full transition-colors ${activeTab === "suggestions" ? "bg-white shadow text-[#3A3A28]" : "text-[#5A5A40] hover:text-[#3A3A28]"}`}
        >
          <div className="flex items-center justify-center gap-2">
            <ImageIcon className="w-4 h-4" /> Sugerencias ({suggestions.length})
          </div>
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 min-w-[120px] text-sm font-medium py-2.5 px-6 rounded-full transition-colors ${activeTab === "users" ? "bg-white shadow text-[#3A3A28]" : "text-[#5A5A40] hover:text-[#3A3A28]"}`}
          >
            <div className="flex items-center justify-center gap-2">
              <Users className="w-4 h-4" /> Usuarios
            </div>
          </button>
        )}
      </div>

      {activeTab === "suggestions" &&
        (suggestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Todo al día
            </h3>
            <p className="text-gray-500">
              No hay sugerencias pendientes de revisión.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row"
              >
                {suggestion.photo && (
                  <div className="w-full md:w-48 h-48 md:h-auto bg-gray-100 shrink-0">
                    <img
                      src={
                        suggestion.photo.thumbnailUrl ||
                        suggestion.photo.imageUrl
                      }
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {suggestion.type === "claim_authorship" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <UserPlus className="w-3.5 h-3.5" /> Reclamo Autoría
                          </span>
                        )}
                        {suggestion.type === "edit_details" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                            <Edit3 className="w-3.5 h-3.5" /> Cambio Detalles
                          </span>
                        )}
                        {(suggestion.type === "add_curiosity" ||
                          suggestion.type === "add_anecdote") && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                            <Wand2 className="w-3.5 h-3.5" /> Nueva Curiosidad
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />{" "}
                          {new Date(suggestion.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Sugerido por:{" "}
                        <span className="font-medium text-gray-900">
                          {suggestion.suggestedBy}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6 flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                          Original
                        </h4>
                        {suggestion.type === "claim_authorship" && (
                          <p className="text-sm line-through text-gray-500">
                            {suggestion.photo?.owner || "Desconocido"}
                          </p>
                        )}
                        {suggestion.type === "edit_details" && (
                          <div className="space-y-2">
                            <p className="text-sm">
                              <span className="text-gray-400">Año:</span>{" "}
                              {suggestion.photo?.year || "-"}
                            </p>
                            <p className="text-sm">
                              <span className="text-gray-400">Desc:</span>{" "}
                              <span className="line-clamp-2">
                                {suggestion.photo?.description || "-"}
                              </span>
                            </p>
                          </div>
                        )}
                        {(suggestion.type === "add_curiosity" ||
                          suggestion.type === "add_anecdote") && (
                          <p className="text-sm text-gray-400 italic">
                            Nueva aportación
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">
                          Propuesto
                        </h4>
                        {suggestion.type === "claim_authorship" && (
                          <p className="text-sm font-medium text-gray-900">
                            {suggestion.proposedChanges?.owner}
                          </p>
                        )}
                        {suggestion.type === "edit_details" && (
                          <div className="space-y-2">
                            {suggestion.proposedChanges?.year && (
                              <p className="text-sm font-medium">
                                <span className="text-gray-400 font-normal">
                                  Año:
                                </span>{" "}
                                {suggestion.proposedChanges.year}
                              </p>
                            )}
                            {suggestion.proposedChanges?.description && (
                              <p className="text-sm font-medium">
                                <span className="text-gray-400 font-normal">
                                  Desc:
                                </span>{" "}
                                {suggestion.proposedChanges.description}
                              </p>
                            )}
                          </div>
                        )}
                        {(suggestion.type === "add_curiosity" ||
                          suggestion.type === "add_anecdote") && (
                          <p className="text-sm font-medium text-gray-900">
                            "{suggestion.proposedChanges?.curiosityText}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 mt-auto">
                    <button
                      onClick={() => handleAction(suggestion, "rejected")}
                      disabled={actionLoading === suggestion.id}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      {actionLoading === suggestion.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4 text-red-500" />
                      )}{" "}
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleAction(suggestion, "approved")}
                      disabled={actionLoading === suggestion.id}
                      className="px-4 py-2 bg-gray-900 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-black flex items-center gap-2"
                    >
                      {actionLoading === suggestion.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 text-green-400" />
                      )}{" "}
                      Aprobar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {activeTab === "users" && isAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Creado
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {u.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <select
                      value={u.role || (u.isAdmin ? "admin" : "user")}
                      onChange={(e) =>
                        handleChangeRole(u.id, e.target.value as Role)
                      }
                      className="border border-gray-300 rounded-lg text-sm px-3 py-1.5 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="user">Usuario</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
